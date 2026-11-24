import { readFile } from 'node:fs/promises';

import { loadCase, loadCitationGuidance, loadExaminerNotes } from '../server/case.server';
import { buildCatalogue } from '../server/catalogue';
import { embed } from '../server/embed.server';
import { loadNoteIndex } from '../server/note-index.server';
import type { NoteChunk, NoteIndex, NoteSentence } from '../server/note-types';
import type { EvalCase, EvalContext, RetrievalTarget } from './types';

export async function loadContext(): Promise<EvalContext> {
  const publicCase = await loadCase();
  const spec = JSON.parse(await readFile('evals/cases/retrieval.json', 'utf8')) as { targets: Array<RetrievalTarget> };
  return {
    publicCase,
    catalogue: buildCatalogue(publicCase),
    notes: await loadExaminerNotes(),
    guidance: await loadCitationGuidance(),
    index: await loadNoteIndex(),
    targets: spec.targets,
    vectors: new Map(),
  };
}

export async function readCases<I, E>(file: string): Promise<Array<EvalCase<I, E>>> {
  const text = await readFile(`evals/cases/${file}`, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as EvalCase<I, E>);
}

// "examiner_notes.key_points[1]" -> that key point, read from the live case
// file, so the cases follow an edit to it. "text:..." is taken as written.
export function resolveTarget(ctx: EvalContext, source: string): string {
  if (source.startsWith('text:')) return source.slice(5);
  const m = /^examiner_notes\.(\w+)(?:\[(\d+)\])?$/.exec(source);
  if (!m) throw new Error(`Bad target: ${source}`);
  const value = (ctx.notes as Record<string, unknown>)[m[1]];
  const text = m[2] === undefined ? value : (value as Array<unknown> | undefined)?.[Number(m[2])];
  if (typeof text !== 'string') throw new Error(`Nothing in the case file at ${source}`);
  return text;
}

// Sentences are named in the case files by a phrase they contain.
export function findSentence(index: NoteIndex, phrase: string): { chunk: NoteChunk; sentence: NoteSentence } {
  for (const chunk of index.chunks) {
    const sentence = chunk.sentences.find((s) => s.text.includes(phrase));
    if (sentence) return { chunk, sentence };
  }
  throw new Error(`No sentence in the prepared note contains: "${phrase}"`);
}

export function sentenceIds(index: NoteIndex, phrases: Array<string>): Set<string> {
  return new Set(phrases.map((p) => findSentence(index, p).sentence.id));
}

export async function queryVector(ctx: EvalContext, text: string): Promise<Array<number> | null> {
  if (!ctx.vectors.has(text)) ctx.vectors.set(text, (await embed([text], 'query'))?.[0] ?? null);
  return ctx.vectors.get(text) ?? null;
}
