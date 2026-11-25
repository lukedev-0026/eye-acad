import type { z } from 'zod';

import { ModelProviderError } from '@/common/errors/external-service.error';

import {
  OllamaChatReplySchema,
  OllamaEmbedReplySchema,
  OllamaModelListSchema,
  OllamaShowReplySchema,
  OllamaVersionReplySchema,
} from './ollama.schema';
import type {
  OllamaChatReply,
  OllamaModel,
  OllamaShowReply,
} from './ollama.schema';

export interface OllamaResponse<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly body: T;
}

/** Not named *.client.ts: the framework treats that suffix as browser-only.
 *  Throws on network errors and bad replies; HTTP status is left to `ok`. */
export class OllamaClient {
  readonly host: string;

  constructor(host: string) {
    this.host = host;
  }

  chat(
    body: unknown,
    timeoutMs: number,
  ): Promise<OllamaResponse<OllamaChatReply>> {
    return this.request(
      'POST',
      '/api/chat',
      OllamaChatReplySchema,
      body,
      timeoutMs,
    );
  }

  embed(
    body: unknown,
    timeoutMs: number,
  ): Promise<OllamaResponse<z.infer<typeof OllamaEmbedReplySchema>>> {
    return this.request(
      'POST',
      '/api/embed',
      OllamaEmbedReplySchema,
      body,
      timeoutMs,
    );
  }

  async version(timeoutMs = 3000): Promise<string | null> {
    return (
      (
        await this.request(
          'GET',
          '/api/version',
          OllamaVersionReplySchema,
          undefined,
          timeoutMs,
        )
      ).body.version ?? null
    );
  }

  async installedModels(timeoutMs = 5000): Promise<Array<OllamaModel>> {
    return (
      (
        await this.request(
          'GET',
          '/api/tags',
          OllamaModelListSchema,
          undefined,
          timeoutMs,
        )
      ).body.models ?? []
    );
  }

  async loadedModels(): Promise<Array<OllamaModel>> {
    return (
      (await this.request('GET', '/api/ps', OllamaModelListSchema)).body
        .models ?? []
    );
  }

  async show(model: string): Promise<OllamaShowReply> {
    return (
      await this.request('POST', '/api/show', OllamaShowReplySchema, { model })
    ).body;
  }

  async unload(model: string): Promise<void> {
    await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<OllamaResponse<T>> {
    const response = await fetch(`${this.host}${path}`, {
      method,
      ...(method === 'POST'
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
      ...(timeoutMs === undefined
        ? {}
        : { signal: AbortSignal.timeout(timeoutMs) }),
    });
    const json: unknown = await response.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ModelProviderError(
        'ollama',
        `Ollama's reply to ${path} was not in the expected shape.`,
        {
          cause: parsed.error,
          details: { path, status: response.status },
        },
      );
    }
    return { ok: response.ok, status: response.status, body: parsed.data };
  }
}
