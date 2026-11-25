import { afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaClient } from '@/infrastructure/llm/ollama-http';
import { OllamaEmbedder } from '@/infrastructure/llm/ollama.embedder';
import { fakeFetch, json } from '@tests/fakes/fake-fetch';

const embedder = () =>
  new OllamaEmbedder(
    new OllamaClient('http://ollama.test:11434'),
    'nomic-embed-text',
  );

afterEach(() => vi.unstubAllGlobals());

describe('the embedder', () => {
  it('puts the prefix the model card requires on every text, different for queries and passages', async () => {
    const sent = fakeFetch(() => json({ embeddings: [[0.1], [0.2]] }));

    await embedder().embed(['first', 'second'], 'query');
    await embedder().embed(['first', 'second'], 'document');

    expect(sent[0]?.url).toBe('http://ollama.test:11434/api/embed');
    expect(sent[0]?.body).toEqual({
      model: 'nomic-embed-text',
      input: ['search_query: first', 'search_query: second'],
      truncate: true,
    });
    expect((sent[1]?.body as { input: Array<string> }).input).toEqual([
      'search_document: first',
      'search_document: second',
    ]);
  });

  it('rounds each number to five places, so a saved index is stable', async () => {
    fakeFetch(() => json({ embeddings: [[0.123456789, -0.000004, 1]] }));

    expect(await embedder().embed(['a'], 'query')).toEqual([[0.12346, -0, 1]]);
  });

  it('gives null, so the caller searches by keyword alone, when the model cannot be reached', async () => {
    fakeFetch(() => {
      throw new TypeError('fetch failed');
    });

    expect(await embedder().embed(['a'], 'query')).toBeNull();
  });

  it('gives null for an error status, a missing list, or the wrong number of vectors', async () => {
    fakeFetch(() => json({ error: 'model not found' }, 404));
    expect(await embedder().embed(['a'], 'query')).toBeNull();

    fakeFetch(() => json({}));
    expect(await embedder().embed(['a'], 'query')).toBeNull();

    fakeFetch(() => json({ embeddings: [[0.1]] }));
    expect(await embedder().embed(['a', 'b'], 'query')).toBeNull();
  });
});
