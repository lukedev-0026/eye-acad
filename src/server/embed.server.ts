import { ollamaHost } from './llm/ollama.server';

// Meaning-based search uses a small local embeddings model. Its model card
// requires a task prefix on every text, different for queries and passages;
// without it results are quietly worse.
export const EMBEDDING_MODEL = process.env.VIVA_EMBEDDING_MODEL ?? 'nomic-embed-text';
const PREFIX = { query: 'search_query: ', document: 'search_document: ' } as const;

// Rounded so the committed index is stable and small.
const round = (v: Array<number>) => v.map((x) => Math.round(x * 1e5) / 1e5);

export async function embed(texts: Array<string>, kind: keyof typeof PREFIX): Promise<Array<Array<number>> | null> {
  try {
    const res = await fetch(`${ollamaHost()}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts.map((t) => PREFIX[kind] + t),
        truncate: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embeddings?: Array<Array<number>> };
    if (!json.embeddings || json.embeddings.length !== texts.length) return null;
    return json.embeddings.map(round);
  } catch {
    // Ollama not running: the caller falls back to keyword search alone.
    return null;
  }
}
