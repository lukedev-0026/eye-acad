import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { describeError } from '@/common/errors/to-error';
import type { Secret } from '@/config/secret';
import type { ProviderReply } from '@/domain/llm/call-result';
import type { LanguageModelProvider, ProviderRequest } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';

// Claude adapter, behind the same interface as the Ollama one.
//
// STATUS: WRITTEN FROM THE SDK DOCUMENTATION, NOT RUN. No Anthropic key was
// used in this build, so no call has ever gone through this file and no
// number in the write-up comes from it. Switching a step to
// `"provider": "anthropic"` in config/steps.json is the intended way to use
// it; expect to fix small things on first contact.
//
// What differs from the local models, per Anthropic's documentation:
// - Sampling settings (temperature, top_p, top_k) are rejected by the current
//   models, so none is sent. `seed` does not exist.
// - Thinking cannot be switched off on Opus 5.5 (depth is set by `effort`).
//   On Haiku 5.5 it is switched off with {type: "disabled"} and on Sonnet 5.5
//   with {type: "between_tools"}, both only at effort "high" or lower.
// - A reply can end with stop_reason "refusal"; that is reported as its own
//   outcome and the caller uses its fixed fallback line.

function thinkingParam(settings: StepSettings): Anthropic.ThinkingConfigParam | undefined {
  if (settings.thinking) return { type: 'adaptive' };
  if (settings.model.includes('haiku')) return { type: 'disabled' };
  if (settings.model.includes('sonnet')) return { type: 'between_tools' };
  // Opus 5.5 and above: thinking is always on, so the field is left out.
  return undefined;
}

export class AnthropicProvider implements LanguageModelProvider {
  private readonly apiKey: Secret | null;

  constructor(apiKey: Secret | null) {
    this.apiKey = apiKey;
  }

  async call({ settings, prompt, schema }: ProviderRequest): Promise<ProviderReply> {
    const empty = { text: '', thinkingChars: 0, model: settings.model, server: {} };
    if (!this.apiKey) {
      return { ...empty, outcome: 'infra_error', error: 'ANTHROPIC_API_KEY is not set.' };
    }

    const client = new Anthropic({ apiKey: this.apiKey.reveal(), timeout: settings.timeoutMs, maxRetries: 1 });

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

      // When a format was asked for, the reply's text is the JSON itself. The
      // gateway checks it against the schema, as it does for the local models.
      const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
      return {
        // Checked before the text is read: a refusal or a cut-off reply may
        // carry partial content.
        outcome:
          message.stop_reason === 'refusal' ? 'refusal' : message.stop_reason === 'max_tokens' ? 'truncated' : 'ok',
        text,
        thinkingChars: message.content.reduce(
          (total, block) => total + (block.type === 'thinking' ? block.thinking.length : 0),
          0,
        ),
        model: message.model,
        server: { promptTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
      };
    } catch (e) {
      const detail = e instanceof Anthropic.APIError ? `HTTP ${e.status}: ${e.message}` : describeError(e);
      return { ...empty, outcome: 'infra_error', error: detail };
    }
  }
}
