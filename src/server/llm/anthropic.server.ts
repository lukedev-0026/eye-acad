import type { z } from 'zod';
import { loadEnv } from '../env.server';
import type { Prompt, RawCall, StepSettings } from './types';

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

function thinkingParam(settings: StepSettings): Record<string, string> | undefined {
  if (settings.thinking) return { type: 'adaptive' };
  if (settings.model.includes('haiku')) return { type: 'disabled' };
  if (settings.model.includes('sonnet')) return { type: 'between_tools' };
  // Opus 5.5 and above: thinking is always on, so the field is left out.
  return undefined;
}

export async function callAnthropic(settings: StepSettings, prompt: Prompt, schema: z.ZodType): Promise<RawCall> {
  loadEnv();
  const empty = { text: '', thinkingChars: 0, model: settings.model, server: {} };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...empty, outcome: 'infra_error', error: 'ANTHROPIC_API_KEY is not set.' };
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  const client = new Anthropic({ timeout: settings.timeoutMs, maxRetries: 1 });

  try {
    const thinking = thinkingParam(settings);
    const response = await client.messages.parse({
      model: settings.model,
      max_tokens: settings.maxOutputTokens,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      ...(thinking ? { thinking } : {}),
      output_config: {
        effort: settings.effort ?? 'low',
        ...(settings.forceFormat ? { format: zodOutputFormat(schema) } : {}),
      },
      // The request shape follows the documentation for the current models;
      // the cast covers fields newer than the installed type definitions.
    } as never);

    const message = response as unknown as {
      model: string;
      stop_reason: string | null;
      content: Array<{ type: string; text?: string; thinking?: string }>;
      parsed_output?: unknown;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text =
      message.parsed_output !== undefined && message.parsed_output !== null
        ? JSON.stringify(message.parsed_output)
        : message.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');
    return {
      // Checked before the text is read: a refusal or a cut-off reply may
      // carry partial content.
      outcome:
        message.stop_reason === 'refusal' ? 'refusal' : message.stop_reason === 'max_tokens' ? 'truncated' : 'ok',
      text,
      thinkingChars: message.content
        .filter((b) => b.type === 'thinking')
        .reduce((n, b) => n + (b.thinking?.length ?? 0), 0),
      model: message.model,
      server: { promptTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens },
    };
  } catch (e) {
    const detail = e instanceof Anthropic.APIError ? `HTTP ${e.status}: ${e.message}` : String(e);
    return { ...empty, outcome: 'infra_error', error: detail };
  }
}
