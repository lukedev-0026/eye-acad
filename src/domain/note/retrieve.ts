import { itemAt } from '@/common/arrays';

import { searchText } from './note-text';
import type { NoteChunk, NoteIndex } from './note.schema';

// Finding the passages of the note that bear on a key point. Two searches run
// side by side and their rankings are combined. No language model is involved.

const STOPWORDS = new Set(
  `a an and are as at be because been before but by can could did do does for from had has have if in into is it its
   may more most no not of on once or other so some such than that the their them then there these they this those to
   too under until up very was were what when where which while who why will with without would you your should after
   also any both each either how often usually about above below per via e g eg ie`.split(/\s+/),
);

// Plural-only stemming: "iridotomies" and "iridotomy" match, "pressures" and
// "pressure" match. Anything cleverer starts merging words that differ.
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies') && !/[ae]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('es') && !/[aeo]es$/.test(word)) return word.slice(0, -1);
  if (word.length > 3 && word.endsWith('s') && !/(us|ss)$/.test(word)) return word.slice(0, -1);
  return word;
}

// One tokeniser for both the note and the query. (The retired LangChain
// keyword search lower-cased one side only, so "iop" never matched "IOP".)
export function tokenize(text: string): Array<string> {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export class Bm25 {
  private readonly docs: Array<Map<string, number>>;
  private readonly lengths: Array<number>;
  private readonly averageLength: number;
  private readonly documentFrequency = new Map<string, number>();
  private readonly k1: number;
  private readonly b: number;

  constructor(documents: Array<Array<string>>, k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.docs = documents.map((tokens) => {
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) {
        this.documentFrequency.set(t, (this.documentFrequency.get(t) ?? 0) + 1);
      }
      return counts;
    });
    this.lengths = documents.map((d) => d.length);
    this.averageLength = this.lengths.reduce((a, n) => a + n, 0) / Math.max(1, this.lengths.length);
  }

  scores(query: Array<string>): Array<number> {
    const n = this.docs.length;
    const terms = [...new Set(query)];
    return this.docs.map((counts, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = counts.get(term);
        if (!tf) continue;
        const df = this.documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const norm = 1 - this.b + this.b * (itemAt(this.lengths, i) / this.averageLength);
        score += (idf * tf * (this.k1 + 1)) / (tf + this.k1 * norm);
      }
      return score;
    });
  }
}

export function cosine(a: Array<number>, b: Array<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [i, x] of a.entries()) {
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// 1-based rank of every index, best first. Ties keep document order.
function ranks(scores: Array<number>): Array<number> {
  const order = scores.map((s, i) => [s, i] as const).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  const out = new Array<number>(scores.length);
  for (const [rank, [, i]] of order.entries()) out[i] = rank + 1;
  return out;
}

export const TOP_K = 6;
// Reciprocal rank fusion: a passage's score is the sum of 1 / (60 + rank)
// over the two searches. 60 is the constant from the original paper.
const RRF_K = 60;
// "No support" needs BOTH searches to come up empty: fewer than two shared
// content words with any passage, and no passage close in meaning. Set from
// evals/retrieval-table.md, not guessed.
export const MIN_SHARED_WORDS = 2;
export const COSINE_FLOOR = 0.55;

export interface Retrieved {
  chunk: NoteChunk;
  keywordRank: number;
  keywordScore: number;
  meaningRank: number | null;
  cosine: number | null;
  fusedRank: number;
  sharedWords: number;
}

export interface Retrieval {
  mode: 'hybrid' | 'keyword_only';
  results: Array<Retrieved>;
  // Every passage, best first, for the comparison table.
  ranking: Array<Retrieved>;
  noSupport: boolean;
  best: { sharedWords: number; cosine: number | null };
}

export function retrieve(
  index: NoteIndex,
  query: {
    // The missed key point. The "no support" test is made on this alone.
    target: string;
    // Optional extra words for the search only: the trainee's own phrase.
    extra?: string;
    // Embedding of target + extra, when the embeddings model is available.
    vector?: Array<number> | null;
  },
  options: { exclude?: Array<string> } = {},
): Retrieval {
  const chunks = index.chunks.filter((c) => !options.exclude?.includes(c.id));
  const tokens = chunks.map((c) => tokenize(searchText(c)));
  const queryTokens = tokenize(`${query.target} ${query.extra ?? ''}`);
  const keywordScores = new Bm25(tokens).scores(queryTokens);
  const keywordRanks = ranks(keywordScores);

  // Meaning-based search needs a vector for the query and for every passage.
  const queryVector = query.vector ?? null;
  const chunkVectors = chunks.map((c) => c.vector ?? null);
  const cosines =
    queryVector && chunkVectors.every((v) => v !== null) ? chunkVectors.map((v) => cosine(queryVector, v)) : null;
  const useMeaning = cosines !== null;
  const meaningRanks = cosines ? ranks(cosines) : null;

  const targetWords = new Set(tokenize(query.target));
  const shared = tokens.map((t) => {
    const mine = new Set(t);
    let n = 0;
    for (const w of targetWords) if (mine.has(w)) n++;
    return n;
  });

  const fused = chunks.map((_, i) => {
    // A passage with no keyword overlap at all contributes nothing from that
    // search, however the ties happened to fall.
    const keyword = itemAt(keywordScores, i) > 0 ? 1 / (RRF_K + itemAt(keywordRanks, i)) : 0;
    const meaning = meaningRanks ? 1 / (RRF_K + itemAt(meaningRanks, i)) : 0;
    return keyword + meaning;
  });
  const fusedRanks = ranks(fused);

  const ranking = chunks
    .map((chunk, i): Retrieved => ({
      chunk,
      keywordRank: itemAt(keywordRanks, i),
      keywordScore: Number(itemAt(keywordScores, i).toFixed(3)),
      meaningRank: meaningRanks ? itemAt(meaningRanks, i) : null,
      cosine: cosines ? Number(itemAt(cosines, i).toFixed(3)) : null,
      fusedRank: itemAt(fusedRanks, i),
      sharedWords: itemAt(shared, i),
    }))
    .sort((a, b) => a.fusedRank - b.fusedRank);

  const best = {
    sharedWords: Math.max(0, ...shared),
    cosine: cosines ? Number(Math.max(...cosines).toFixed(3)) : null,
  };
  const noSupport = best.sharedWords < MIN_SHARED_WORDS && (best.cosine === null || best.cosine < COSINE_FLOOR);

  return {
    mode: useMeaning ? 'hybrid' : 'keyword_only',
    results: noSupport ? [] : ranking.slice(0, TOP_K),
    ranking,
    noSupport,
    best,
  };
}
