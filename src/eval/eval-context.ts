import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { readJsonl } from '@/common/jsonl.server';
import { getConfig } from '@/config/env.server';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import type { NoteChunk, NoteIndex, NoteSentence } from '@/domain/note/note.schema';
import { loadCase, loadCitationGuidance, loadExaminerNotes } from '@/infrastructure/files/case-file.loader';
import { loadNoteIndex } from '@/infrastructure/files/note-index.loader';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

import { RetrievalSpecSchema, evalCaseSchema } from './eval-case.schema';
import type { RetrievalSpec } from './eval-case.schema';
import { InvalidEvalCaseError } from './eval.error';
import type { EvalCase, EvalContext } from './eval.types';
import { PATHS, caseFile } from './paths';

export async function loadRetrievalSpec(): Promise<RetrievalSpec> {
  const parsed = RetrievalSpecSchema.safeParse(JSON.parse(await readFile(PATHS.retrievalTargets, 'utf8')));
  if (!parsed.success) {
    throw new InvalidEvalCaseError(
      `${PATHS.retrievalTargets} is not in the expected form:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

// Everything a check needs that does not change from case to case: the live
// case file, the prepared note, and the same model gateway the app uses.
export async function loadContext(): Promise<EvalContext> {
  const publicCase = await loadCase();
  return {
    models: createLanguageModelGateway(getConfig()),
    publicCase,
    catalogue: buildCatalogue(publicCase),
    notes: await loadExaminerNotes(),
    guidance: await loadCitationGuidance(),
    index: await loadNoteIndex(),
    targets: (await loadRetrievalSpec()).targets,
    vectors: new Map(),
  };
}

// The cases for one step, each checked against that step's shapes. A case
// file with a mistake in it is refused by name, before any model runs.
export async function readCases<I extends z.ZodType, E extends z.ZodType>(
  name: string,
  input: I,
  expect: E,
): Promise<Array<EvalCase<z.output<I>, z.output<E>>>> {
  const schema = evalCaseSchema(input, expect);
  const rows = await readJsonl(caseFile(name));
  return rows.map((row, i) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      throw new InvalidEvalCaseError(`${caseFile(name)}, line ${i + 1}:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data as EvalCase<z.output<I>, z.output<E>>;
  });
}

const NOTES_PATH = /^examiner_notes\.(\w+)(?:\[(\d+)\])?$/;

// "examiner_notes.key_points[1]" -> that key point, read from the live case
// file, so the cases follow an edit to it. "text:..." is taken as written.
export function resolveTarget(ctx: Pick<EvalContext, 'notes'>, source: string): string {
  if (source.startsWith('text:')) return source.slice('text:'.length);
  const [, field, position] = NOTES_PATH.exec(source) ?? [];
  if (!field) throw new InvalidEvalCaseError(`Bad target: ${source}`);
  const value: unknown = Object.entries(ctx.notes).find(([key]) => key === field)?.[1];
  const text: unknown = position === undefined ? value : Array.isArray(value) ? value[Number(position)] : undefined;
  if (typeof text !== 'string') throw new InvalidEvalCaseError(`Nothing in the case file at ${source}`);
  return text;
}

// Sentences are named in the case files by a phrase they contain.
export function findSentence(index: NoteIndex, phrase: string): { chunk: NoteChunk; sentence: NoteSentence } {
  for (const chunk of index.chunks) {
    const sentence = chunk.sentences.find((s) => s.text.includes(phrase));
    if (sentence) return { chunk, sentence };
  }
  throw new InvalidEvalCaseError(`No sentence in the prepared note contains: "${phrase}"`);
}

export function sentenceIds(index: NoteIndex, phrases: ReadonlyArray<string>): Set<string> {
  return new Set(phrases.map((p) => findSentence(index, p).sentence.id));
}

// The embedding of a search query, asked for once and then kept, so that every
// configuration searches identically.
export async function queryVector(
  ctx: Pick<EvalContext, 'models' | 'vectors'>,
  text: string,
): Promise<Array<number> | null> {
  if (!ctx.vectors.has(text)) ctx.vectors.set(text, (await ctx.models.embed([text], 'query'))?.[0] ?? null);
  return ctx.vectors.get(text) ?? null;
}
