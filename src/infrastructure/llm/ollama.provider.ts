import { describeError } from '@/common/errors/to-error';
import type { ProviderReply } from '@/domain/llm/call-result';
import type { LanguageModelProvider, ProviderRequest } from '@/domain/llm/language-model.gateway';

import type { OllamaClient, OllamaResponse } from './ollama-http';
import type { OllamaChatReply } from './ollama.schema';

const toMs = (nanoseconds: number | null | undefined): number | undefined =>
  nanoseconds === null || nanoseconds === undefined ? undefined : Math.round(nanoseconds / 1e6);

// A local model, through one non-streaming chat call to Ollama.
export class OllamaProvider implements LanguageModelProvider {
  private readonly client: OllamaClient;
  private readonly keepAlive: string;

  constructor(client: OllamaClient, keepAlive: string) {
    this.client = client;
    this.keepAlive = keepAlive;
  }

  async call({ settings, prompt, jsonSchema }: ProviderRequest): Promise<ProviderReply> {
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
      keep_alive: this.keepAlive,
    };

    const empty = { text: '', thinkingChars: 0, model: settings.model, server: {} };
    let response: OllamaResponse<OllamaChatReply>;
    try {
      response = await this.client.chat(body, settings.timeoutMs);
    } catch (error) {
      // Running out of time is the model's failure, not the machine's: the reply
      // was cut off by the time limit, so it is a failed run and it is counted.
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return timedOut
        ? { ...empty, outcome: 'truncated', error: `no reply within ${settings.timeoutMs} ms` }
        : { ...empty, outcome: 'infra_error', error: describeError(error) };
    }

    const reply = response.body;
    if (!response.ok || reply.error) {
      return { ...empty, outcome: 'infra_error', error: reply.error ?? `HTTP ${response.status}` };
    }
    return {
      outcome: reply.done_reason === 'length' ? 'truncated' : 'ok',
      text: reply.message?.content ?? '',
      thinkingChars: reply.message?.thinking?.length ?? 0,
      model: reply.model ?? settings.model,
      server: {
        loadMs: toMs(reply.load_duration),
        promptEvalMs: toMs(reply.prompt_eval_duration),
        evalMs: toMs(reply.eval_duration),
        promptTokens: reply.prompt_eval_count ?? undefined,
        outputTokens: reply.eval_count ?? undefined,
      },
    };
  }
}
