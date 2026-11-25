import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { readJsonl } from '@/common/jsonl.server';
import { getConfig } from '@/config/env.server';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import type {
  NoteChunk,
  NoteIndex,
  NoteSentence,
} from '@/domain/note/note.schema';
import {
  loadCase,
  loadCitationGuidance,
  loadExaminerNotes,
} from '@/infrastructure/files/case-file.loader';
import { loadNoteIndex } from '@/infrastructure/files/note-index.loader';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

import { RetrievalSpecSchema, SPLITS } from './eval-case.schema';
import type { RetrievalSpec } from './eval-case.schema';
import { InvalidEvalCaseError } from './eval.error';
import type { EvalCase, EvalContext } from './eval.types';
import { PATHS, caseFile } from './paths';

export async function loadRetrievalSpec(): Promise<RetrievalSpec> {
  const parsed = RetrievalSpecSchema.safeParse(
    JSON.parse(await readFile(PATHS.retrievalTargets, 'utf8')),
  );
  if (!parsed.success) {
    throw new InvalidEvalCaseError(
      `${PATHS.retrievalTargets} is not in the expected form:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

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

const CaseEnvelopeSchema = z.object({
  id: z.string().min(1),
  split: z.enum(SPLITS),
  type: z.string(),
  input: z.unknown(),
  expect: z.unknown(),
  note: z.string().optional(),
});

function parseCasePart<S extends z.ZodType>(
  schema: S,
  value: unknown,
  where: string,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new InvalidEvalCaseError(
      `${where}:\n${z.prettifyError(parsed.error)}`,
    );
  return parsed.data;
}

/** Checks each case against the step's shapes; a bad case fails by name. */
export async function readCases<I extends z.ZodType, E extends z.ZodType>(
  name: string,
  input: I,
  expect: E,
): Promise<Array<EvalCase<z.output<I>, z.output<E>>>> {
  const rows = await readJsonl(caseFile(name));
  return rows.map((row, i) => {
    const where = `${caseFile(name)}, line ${i + 1}`;
    const envelope = parseCasePart(CaseEnvelopeSchema, row, where);
    return {
      ...envelope,
      input: parseCasePart(input, envelope.input, `${where}, input`),
      expect: parseCasePart(expect, envelope.expect, `${where}, expect`),
    };
  });
}

const NOTES_PATH = /^examiner_notes\.(\w+)(?:\[(\d+)\])?$/;

/**
 * Resolves "examiner_notes.key_points[1]" from the live case file;
 * "text:..." is taken as written.
 */
export function resolveTarget(
  ctx: Pick<EvalContext, 'notes'>,
  source: string,
): string {
  if (source.startsWith('text:')) return source.slice('text:'.length);
  const [, field, position] = NOTES_PATH.exec(source) ?? [];
  if (!field) throw new InvalidEvalCaseError(`Bad target: ${source}`);
  const value: unknown = Object.entries(ctx.notes).find(
    ([key]) => key === field,
  )?.[1];
  const text: unknown =
    position === undefined
      ? value
      : Array.isArray(value)
        ? value[Number(position)]
        : undefined;
  if (typeof text !== 'string')
    throw new InvalidEvalCaseError(`Nothing in the case file at ${source}`);
  return text;
}

export function findSentence(
  index: NoteIndex,
  phrase: string,
): { chunk: NoteChunk; sentence: NoteSentence } {
  for (const chunk of index.chunks) {
    const sentence = chunk.sentences.find((s) => s.text.includes(phrase));
    if (sentence) return { chunk, sentence };
  }
  throw new InvalidEvalCaseError(
    `No sentence in the prepared note contains: "${phrase}"`,
  );
}

export function sentenceIds(
  index: NoteIndex,
  phrases: ReadonlyArray<string>,
): Set<string> {
  return new Set(phrases.map((p) => findSentence(index, p).sentence.id));
}

/** Embeds a query once and caches it, so every configuration searches alike. */
export async function queryVector(
  ctx: Pick<EvalContext, 'models' | 'vectors'>,
  text: string,
): Promise<Array<number> | null> {
  if (!ctx.vectors.has(text))
    ctx.vectors.set(
      text,
      (await ctx.models.embed([text], 'query'))?.[0] ?? null,
    );
  return ctx.vectors.get(text) ?? null;
}
