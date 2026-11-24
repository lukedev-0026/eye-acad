import type { EmbeddingKind } from '@/domain/llm/language-model.gateway';

import type { OllamaClient } from './ollama-http';

// Meaning-based search uses a small local embeddings model. Its model card
// requires a task prefix on every text, different for queries and passages;
// without it results are quietly worse.
const PREFIX: Record<EmbeddingKind, string> = { query: 'search_query: ', document: 'search_document: ' };

const TIMEOUT_MS = 60_000;

// Rounded so the committed index is stable and small.
const round = (vector: Array<number>): Array<number> => vector.map((x) => Math.round(x * 1e5) / 1e5);

export class OllamaEmbedder {
  readonly model: string;
  private readonly client: OllamaClient;

  constructor(client: OllamaClient, model: string) {
    this.client = client;
    this.model = model;
  }

  // One vector per text, or null if the embeddings model cannot be reached or
  // answers with anything else. The caller then searches by keyword alone.
  async embed(texts: ReadonlyArray<string>, kind: EmbeddingKind): Promise<Array<Array<number>> | null> {
    try {
      const response = await this.client.embed(
        { model: this.model, input: texts.map((text) => PREFIX[kind] + text), truncate: true },
        TIMEOUT_MS,
      );
      const vectors = response.body.embeddings;
      if (!response.ok || !vectors || vectors.length !== texts.length) return null;
      return vectors.map(round);
    } catch {
      // Ollama not running: the caller falls back to keyword search alone.
      return null;
    }
  }
}
