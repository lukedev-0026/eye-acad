import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ProviderReply } from '@/domain/llm/call-result';
import type { LanguageModelProvider, ProviderRequest } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { ProviderLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

const SETTINGS: StepSettings = {
  provider: 'ollama',
  model: 'local',
  thinking: false,
  forceFormat: true,
  promptVariant: 'minimal',
  maxOutputTokens: 100,
  timeoutMs: 1000,
};
const PROMPT = { system: 's', user: 'u' };
const Colour = z.object({ colour: z.enum(['red', 'green']) });

// A provider that answers with whatever the test says, and remembers what it was asked.
class StubProvider implements LanguageModelProvider {
  readonly requests: Array<ProviderRequest> = [];
  private readonly reply: Partial<ProviderReply>;

  constructor(reply: Partial<ProviderReply>) {
    this.reply = reply;
  }

  call(request: ProviderRequest): Promise<ProviderReply> {
    this.requests.push(request);
    return Promise.resolve({ outcome: 'ok', text: '', thinkingChars: 0, model: 'stub', server: {}, ...this.reply });
  }
}

const unused = new StubProvider({ outcome: 'infra_error', error: 'should not be called' });
const noEmbeddings = { embed: () => Promise.resolve(null) };
const gatewayWith = (ollama: LanguageModelProvider, anthropic: LanguageModelProvider = unused) =>
  new ProviderLanguageModelGateway({ ollama, anthropic }, noEmbeddings);

describe('the model gateway', () => {
  it('sends a call to the provider its settings name, with the reply shape in both forms', async () => {
    const ollama = new StubProvider({ text: '{"colour":"red"}' });
    const anthropic = new StubProvider({ text: '{"colour":"green"}' });
    const gateway = gatewayWith(ollama, anthropic);

    const local = await gateway.callStep(SETTINGS, PROMPT, Colour);
    const claude = await gateway.callStep({ ...SETTINGS, provider: 'anthropic' }, PROMPT, Colour);

    expect(local).toMatchObject({ outcome: 'ok', value: { colour: 'red' }, provider: 'ollama', model: 'stub' });
    expect(claude).toMatchObject({ outcome: 'ok', value: { colour: 'green' }, provider: 'anthropic' });
    expect(ollama.requests).toHaveLength(1);
    expect(ollama.requests[0]?.schema).toBe(Colour);
    expect(ollama.requests[0]?.jsonSchema).toEqual(z.toJSONSchema(Colour));
  });

  it('checks the reply against the schema itself, whether or not the provider was asked to', async () => {
    const result = await gatewayWith(new StubProvider({ text: '{"colour":"yellow"}' })).callStep(
      { ...SETTINGS, forceFormat: false },
      PROMPT,
      Colour,
    );

    expect(result.outcome).toBe('schema_invalid');
    expect(result.value).toBeUndefined();
    expect(result.error).toContain('colour');
    expect(result.rawText).toBe('{"colour":"yellow"}');
  });

  it('finds the JSON inside a code fence or a sentence', async () => {
    const fenced = 'Here you go:\n```json\n{"colour":"green"}\n```\nHope that helps.';

    const result = await gatewayWith(new StubProvider({ text: fenced })).callStep(SETTINGS, PROMPT, Colour);

    expect(result).toMatchObject({ outcome: 'ok', value: { colour: 'green' } });
  });

  it('reports a reply with no JSON in it as not in the required shape', async () => {
    const result = await gatewayWith(new StubProvider({ text: 'I cannot help with that.' })).callStep(
      SETTINGS,
      PROMPT,
      Colour,
    );

    expect(result.outcome).toBe('schema_invalid');
  });

  it('tidies a reply before checking it, without widening what is accepted', async () => {
    const gateway = gatewayWith(new StubProvider({ text: '{"colour":"RED"}' }));
    const lowerCase = (value: unknown) => {
      const v = value as { colour?: unknown };
      return { colour: typeof v.colour === 'string' ? v.colour.toLowerCase() : v.colour };
    };

    expect((await gateway.callStep(SETTINGS, PROMPT, Colour)).outcome).toBe('schema_invalid');
    expect(await gateway.callStep(SETTINGS, PROMPT, Colour, { normalise: lowerCase })).toMatchObject({
      outcome: 'ok',
      value: { colour: 'red' },
    });
  });

  it("passes a provider's failure through with no value", async () => {
    for (const outcome of ['refusal', 'truncated', 'infra_error'] as const) {
      const result = await gatewayWith(new StubProvider({ outcome, error: 'why', text: '{"colour":"red"}' })).callStep(
        SETTINGS,
        PROMPT,
        Colour,
      );

      expect(result).toMatchObject({ outcome, error: 'why' });
      expect(result.value).toBeUndefined();
    }
  });

  it('times the whole call and keeps the figures the provider reported', async () => {
    const result = await gatewayWith(
      new StubProvider({ text: '{"colour":"red"}', thinkingChars: 12, server: { evalMs: 300, outputTokens: 7 } }),
    ).callStep(SETTINGS, PROMPT, Colour);

    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(result).toMatchObject({ thinkingChars: 12, server: { evalMs: 300, outputTokens: 7 } });
  });

  it('hands embedding requests to the embedder', async () => {
    const gateway = new ProviderLanguageModelGateway(
      { ollama: unused, anthropic: unused },
      { embed: (texts, kind) => Promise.resolve(texts.map((text) => [text.length, kind === 'query' ? 1 : 0])) },
    );

    expect(await gateway.embed(['ab', 'abc'], 'query')).toEqual([
      [2, 1],
      [3, 1],
    ]);
  });
});
