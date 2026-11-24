import { z } from 'zod';

import { extractJson } from './json';
import { callOllama } from './ollama.server';
import type { CallResult, Prompt, RawCall, StepSettings } from './types';

// The single door every model call goes through, in the app and in the checks
// alike. It returns a typed result and never throws: the caller decides which
// fixed fallback an unusable result maps to.
export async function callStep<T>(
  settings: StepSettings,
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: {
    // Tidies a parsed reply before it is checked (for example matching a
    // label case-insensitively). It cannot widen what the schema accepts.
    normalise?: (value: unknown) => unknown;
  } = {},
): Promise<CallResult<T>> {
  const started = performance.now();
  const jsonSchema = z.toJSONSchema(schema);

  let raw: RawCall;
  if (settings.provider === 'ollama') {
    raw = await callOllama(settings, prompt, jsonSchema);
  } else {
    const { callAnthropic } = await import('./anthropic.server');
    raw = await callAnthropic(settings, prompt, schema);
  }

  const base = {
    rawText: raw.text,
    thinkingChars: raw.thinkingChars,
    model: raw.model,
    provider: settings.provider,
    ms: Math.round(performance.now() - started),
    server: raw.server,
  };
  if (raw.outcome !== 'ok') {
    return { ...base, outcome: raw.outcome, error: raw.error };
  }

  // The same check whether or not the provider was asked to enforce the
  // format. This, not the provider, is what keeps an out-of-list answer out.
  const json = extractJson(raw.text);
  const candidate = options.normalise ? options.normalise(json) : json;
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ...base,
      outcome: 'schema_invalid',
      error: z.prettifyError(parsed.error),
    };
  }
  return { ...base, outcome: 'ok', value: parsed.data };
}

// Appended to every prompt, forced format or not, so that switching the
// provider's enforcement on and off changes one thing only.
export function describeJsonShape(schema: z.ZodType): string {
  return (
    'Reply with one JSON object and nothing else. It must match this JSON schema:\n' +
    JSON.stringify(z.toJSONSchema(schema))
  );
}
