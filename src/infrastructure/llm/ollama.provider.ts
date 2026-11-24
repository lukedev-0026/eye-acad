import type { Prompt, RawCall, StepSettings } from '@/domain/llm/step-settings.schema';

export function ollamaHost(): string {
  return (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
}

type OllamaChatResponse = {
  model?: string;
  message?: { content?: string; thinking?: string };
  done_reason?: string;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
};

const ms = (nanoseconds: number | undefined) => (nanoseconds === undefined ? undefined : Math.round(nanoseconds / 1e6));

// One non-streaming chat call to a local Ollama server.
export async function callOllama(settings: StepSettings, prompt: Prompt, jsonSchema: unknown): Promise<RawCall> {
  const body = {
    model: settings.model,
    stream: false,
    // Always sent. Left unset, each model falls back to its own default,
    // which differs between sizes of the same family.
    think: settings.thinking,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    ...(settings.forceFormat ? { format: jsonSchema } : {}),
    options: {
      temperature: settings.temperature,
      seed: settings.seed,
      // A prompt longer than the context is cut from the front with no error,
      // so the size is fixed here and checked by the sweep's preflight.
      num_ctx: settings.numCtx,
      num_predict: settings.maxOutputTokens,
      ...settings.sampling,
    },
    keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '30m',
  };

  const empty = { text: '', thinkingChars: 0, model: settings.model, server: {} };
  let json: OllamaChatResponse;
  try {
    const res = await fetch(`${ollamaHost()}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
    json = (await res.json()) as OllamaChatResponse;
    if (!res.ok || json.error) {
      return {
        ...empty,
        outcome: 'infra_error',
        error: json.error ?? `HTTP ${res.status}`,
      };
    }
  } catch (e) {
    // Running out of time is the model's failure, not the machine's: the reply
    // was cut off by the time limit, so it is a failed run and it is counted.
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return timedOut
      ? { ...empty, outcome: 'truncated', error: `no reply within ${settings.timeoutMs} ms` }
      : { ...empty, outcome: 'infra_error', error: String(e) };
  }

  return {
    outcome: json.done_reason === 'length' ? 'truncated' : 'ok',
    text: json.message?.content ?? '',
    thinkingChars: json.message?.thinking?.length ?? 0,
    model: json.model ?? settings.model,
    server: {
      loadMs: ms(json.load_duration),
      promptEvalMs: ms(json.prompt_eval_duration),
      evalMs: ms(json.eval_duration),
      promptTokens: json.prompt_eval_count,
      outputTokens: json.eval_count,
    },
  };
}
