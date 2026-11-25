import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { describeError } from '@/common/errors/to-error';
import type { Secret } from '@/config/secret';
import type { ProviderReply } from '@/domain/llm/call-result';
import type {
  LanguageModelProvider,
  ProviderRequest,
} from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';

// Written from the SDK documentation and never run; expect small fixes.

function thinkingParam(
  settings: StepSettings,
): Anthropic.ThinkingConfigParam | undefined {
  if (settings.thinking) return { type: 'adaptive' };
  if (settings.model.includes('haiku')) return { type: 'disabled' };
  if (settings.model.includes('sonnet')) return { type: 'between_tools' };
  // Opus cannot switch thinking off, so the field is left out.
  return undefined;
}

export class AnthropicProvider implements LanguageModelProvider {
  private readonly apiKey: Secret | null;

  constructor(apiKey: Secret | null) {
    this.apiKey = apiKey;
  }

  async call({
    settings,
    prompt,
    schema,
  }: ProviderRequest): Promise<ProviderReply> {
    const empty = {
      text: '',
      thinkingChars: 0,
      model: settings.model,
      server: {},
    };
    if (!this.apiKey) {
      return {
        ...empty,
        outcome: 'infra_error',
        error: 'ANTHROPIC_API_KEY is not set.',
      };
    }

    const client = new Anthropic({
      apiKey: this.apiKey.reveal(),
      timeout: settings.timeoutMs,
      maxRetries: 1,
    });

    try {
      const thinking = thinkingParam(settings);
      const message = await client.messages.parse({
        model: settings.model,
        max_tokens: settings.maxOutputTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        ...(thinking ? { thinking } : {}),
        output_config: {
          effort: settings.effort ?? 'low',
          ...(settings.forceFormat ? { format: zodOutputFormat(schema) } : {}),
        },
      });

      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      return {
        // Checked before the text: a refusal may carry partial content.
        outcome:
          message.stop_reason === 'refusal'
            ? 'refusal'
            : message.stop_reason === 'max_tokens'
              ? 'truncated'
              : 'ok',
        text,
        thinkingChars: message.content.reduce(
          (total, block) =>
            total + (block.type === 'thinking' ? block.thinking.length : 0),
          0,
        ),
        model: message.model,
        server: {
          promptTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (e) {
      const detail =
        e instanceof Anthropic.APIError
          ? `HTTP ${e.status}: ${e.message}`
          : describeError(e);
      return { ...empty, outcome: 'infra_error', error: detail };
    }
  }
}
