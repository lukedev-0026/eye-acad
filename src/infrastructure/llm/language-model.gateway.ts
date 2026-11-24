import { z } from 'zod';

import { getLogger } from '@/common/logging/logger.server';
import type { AppConfig } from '@/config/env.server';
import type { CallResult, Prompt } from '@/domain/llm/call-result';
import { extractJson } from '@/domain/llm/extract-json';
import type {
  CallStepOptions,
  EmbeddingKind,
  LanguageModelGateway,
  LanguageModelProvider,
} from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';

import { AnthropicProvider } from './anthropic.provider';
import { OllamaClient } from './ollama-http';
import { OllamaEmbedder } from './ollama.embedder';
import { OllamaProvider } from './ollama.provider';

type ProviderName = StepSettings['provider'];

const log = () => getLogger('language-model');

interface Embedder {
  embed(texts: ReadonlyArray<string>, kind: EmbeddingKind): Promise<Array<Array<number>> | null>;
}

// Sends each call to the provider its settings name, then checks the reply
// here, the same way for every provider.
export class ProviderLanguageModelGateway implements LanguageModelGateway {
  private readonly providers: Readonly<Record<ProviderName, LanguageModelProvider>>;
  private readonly embedder: Embedder;

  constructor(providers: Readonly<Record<ProviderName, LanguageModelProvider>>, embedder: Embedder) {
    this.providers = providers;
    this.embedder = embedder;
  }

  async callStep<T>(
    settings: StepSettings,
    prompt: Prompt,
    schema: z.ZodType<T>,
    options: CallStepOptions = {},
  ): Promise<CallResult<T>> {
    const started = performance.now();
    const reply = await this.providers[settings.provider].call({
      settings,
      prompt,
      schema,
      jsonSchema: z.toJSONSchema(schema),
    });

    const facts = {
      rawText: reply.text,
      thinkingChars: reply.thinkingChars,
      model: reply.model,
      provider: settings.provider,
      ms: Math.round(performance.now() - started),
      server: reply.server,
    };
    const logged = {
      step: options.step,
      provider: settings.provider,
      model: reply.model,
      promptVariant: settings.promptVariant,
      durationMs: facts.ms,
      promptTokens: reply.server.promptTokens,
      outputTokens: reply.server.outputTokens,
      thinkingChars: reply.thinkingChars,
    };
    if (reply.outcome !== 'ok') {
      // An expected outcome, not an exception: the caller has a fallback for it.
      log().info(
        { ...logged, actionResult: 'FAILED', outcome: reply.outcome, reason: reply.error },
        'callStep.unusable',
      );
      return { ...facts, outcome: reply.outcome, error: reply.error };
    }

    // The same check whether or not the provider was asked to enforce the
    // format. This, not the provider, is what keeps an out-of-list answer out.
    const json = extractJson(reply.text);
    const candidate = options.normalise ? options.normalise(json) : json;
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const reason = z.prettifyError(parsed.error);
      log().info({ ...logged, actionResult: 'FAILED', outcome: 'schema_invalid', reason }, 'callStep.unusable');
      return { ...facts, outcome: 'schema_invalid', error: reason };
    }
    log().debug({ ...logged, actionResult: 'SUCCESS', outcome: 'ok' }, 'callStep.completed');
    return { ...facts, outcome: 'ok', value: parsed.data };
  }

  embed(texts: ReadonlyArray<string>, kind: EmbeddingKind): Promise<Array<Array<number>> | null> {
    return this.embedder.embed(texts, kind);
  }
}

// The real gateway: local models through Ollama, Claude through Anthropic's
// API, embeddings from the local embeddings model.
export function createLanguageModelGateway(
  config: Pick<AppConfig, 'ollama' | 'embeddings' | 'anthropic'>,
): LanguageModelGateway {
  const ollama = new OllamaClient(config.ollama.host);
  return new ProviderLanguageModelGateway(
    {
      ollama: new OllamaProvider(ollama, config.ollama.keepAlive),
      anthropic: new AnthropicProvider(config.anthropic.apiKey),
    },
    new OllamaEmbedder(ollama, config.embeddings.model),
  );
}
