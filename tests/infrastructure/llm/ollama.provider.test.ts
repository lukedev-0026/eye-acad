import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ProviderRequest } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { OllamaClient } from '@/infrastructure/llm/ollama-http';
import { OllamaProvider } from '@/infrastructure/llm/ollama.provider';
import { fakeFetch, json, timeoutError } from '@tests/fakes/fake-fetch';

const SETTINGS: StepSettings = {
  provider: 'ollama',
  model: 'qwen3.5:9b',
  thinking: false,
  forceFormat: true,
  promptVariant: 'minimal',
  temperature: 0.7,
  seed: 3,
  sampling: { top_p: 0.8, top_k: 20, presence_penalty: 1.5 },
  maxOutputTokens: 400,
  numCtx: 8192,
  timeoutMs: 30_000,
};
const Schema = z.object({ verdict: z.enum(['yes', 'no']) });
const request = (settings: Partial<StepSettings> = {}): ProviderRequest => ({
  settings: { ...SETTINGS, ...settings },
  prompt: { system: 'You judge.', user: 'Is it so?' },
  schema: Schema,
  jsonSchema: z.toJSONSchema(Schema),
});
const provider = () =>
  new OllamaProvider(new OllamaClient('http://ollama.test:11434'), '30m');
const GOOD_REPLY = {
  model: 'qwen3.5:9b',
  message: { content: '{"verdict":"yes"}', thinking: 'hmm' },
  done_reason: 'stop',
  load_duration: 2_500_000,
  prompt_eval_count: 120,
  prompt_eval_duration: 40_400_000,
  eval_count: 9,
  eval_duration: 310_600_000,
};

afterEach(() => vi.unstubAllGlobals());

describe('the Ollama provider', () => {
  it('sends one non-streaming chat request with every setting written out', async () => {
    const sent = fakeFetch(() => json(GOOD_REPLY));

    await provider().call(request());

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      url: 'http://ollama.test:11434/api/chat',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(sent[0]?.body).toEqual({
      model: 'qwen3.5:9b',
      stream: false,
      think: false,
      messages: [
        { role: 'system', content: 'You judge.' },
        { role: 'user', content: 'Is it so?' },
      ],
      format: z.toJSONSchema(Schema),
      options: {
        temperature: 0.7,
        seed: 3,
        num_ctx: 8192,
        num_predict: 400,
        top_p: 0.8,
        top_k: 20,
        presence_penalty: 1.5,
      },
      keep_alive: '30m',
    });
    expect(sent[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('always says whether to think, and leaves the format out when it is not forced', async () => {
    const sent = fakeFetch(() => json(GOOD_REPLY));

    await provider().call(request({ thinking: true, forceFormat: false }));
    const body = sent[0]?.body as Record<string, unknown>;

    expect(body.think).toBe(true);
    expect(body).not.toHaveProperty('format');
  });

  it('returns the reply with its timings in milliseconds', async () => {
    fakeFetch(() => json(GOOD_REPLY));

    expect(await provider().call(request())).toEqual({
      outcome: 'ok',
      text: '{"verdict":"yes"}',
      thinkingChars: 3,
      model: 'qwen3.5:9b',
      server: {
        loadMs: 3,
        promptEvalMs: 40,
        evalMs: 311,
        promptTokens: 120,
        outputTokens: 9,
      },
    });
  });

  it('copes with a reply that leaves fields out or sends them as null', async () => {
    fakeFetch(() =>
      json({
        message: { content: 'x', thinking: null },
        done_reason: null,
        eval_duration: null,
      }),
    );

    const reply = await provider().call(request());

    expect(reply).toMatchObject({
      outcome: 'ok',
      text: 'x',
      thinkingChars: 0,
      model: 'qwen3.5:9b',
    });
    expect(reply.server.evalMs).toBeUndefined();
  });

  it('reports a reply cut off by the output cap as truncated', async () => {
    fakeFetch(() => json({ ...GOOD_REPLY, done_reason: 'length' }));

    expect((await provider().call(request())).outcome).toBe('truncated');
  });

  it('reports running out of time as truncated: the model failed, not the machine', async () => {
    fakeFetch(() => {
      throw timeoutError();
    });

    expect(await provider().call(request())).toMatchObject({
      outcome: 'truncated',
      error: 'no reply within 30000 ms',
      text: '',
    });
  });

  it('reports an unreachable server as an infrastructure error, naming what went wrong', async () => {
    fakeFetch(() => {
      throw new TypeError('fetch failed');
    });

    expect(await provider().call(request())).toMatchObject({
      outcome: 'infra_error',
      error: 'TypeError: fetch failed',
    });
  });

  it("passes on Ollama's own error message", async () => {
    fakeFetch(() => json({ error: 'model "qwen3.5:9b" not found' }, 404));

    expect(await provider().call(request())).toMatchObject({
      outcome: 'infra_error',
      error: 'model "qwen3.5:9b" not found',
    });
  });

  it('reports an error status with no message by its number', async () => {
    fakeFetch(() => json({}, 500));

    expect(await provider().call(request())).toMatchObject({
      outcome: 'infra_error',
      error: 'HTTP 500',
    });
  });

  it('reports a reply that is not JSON, or not shaped like a chat reply, as an infrastructure error', async () => {
    fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    expect((await provider().call(request())).outcome).toBe('infra_error');

    fakeFetch(() => json({ message: { content: 42 } }));
    const reply = await provider().call(request());
    expect(reply.outcome).toBe('infra_error');
    expect(reply.error).toContain('not in the expected shape');
  });
});
