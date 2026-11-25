import { getLogger } from '@/common/logging/logger.server';
import type { EmbeddingKind } from '@/domain/llm/language-model.gateway';

import type { OllamaClient } from './ollama-http';

// The model card requires these prefixes; results are worse without them.
const PREFIX: Record<EmbeddingKind, string> = {
  query: 'search_query: ',
  document: 'search_document: ',
};

const TIMEOUT_MS = 60_000;

const log = () => getLogger('embeddings');

const round = (vector: Array<number>): Array<number> =>
  vector.map((x) => Math.round(x * 1e5) / 1e5);

export class OllamaEmbedder {
  readonly model: string;
  private readonly client: OllamaClient;

  constructor(client: OllamaClient, model: string) {
    this.client = client;
    this.model = model;
  }

  /** Null if the model is unreachable or misbehaves: search uses keywords. */
  async embed(
    texts: ReadonlyArray<string>,
    kind: EmbeddingKind,
  ): Promise<Array<Array<number>> | null> {
    try {
      const response = await this.client.embed(
        {
          model: this.model,
          input: texts.map((text) => PREFIX[kind] + text),
          truncate: true,
        },
        TIMEOUT_MS,
      );
      const vectors = response.body.embeddings;
      if (!response.ok || vectors?.length !== texts.length) {
        log().warn(
          {
            actionResult: 'FAILED',
            model: this.model,
            status: response.status,
            texts: texts.length,
          },
          'embed.unusable',
        );
        return null;
      }
      return vectors.map(round);
    } catch (error) {
      log().warn(
        {
          actionResult: 'FAILED',
          model: this.model,
          texts: texts.length,
          err: error,
        },
        'embed.unreachable',
      );
      return null;
    }
  }
}
