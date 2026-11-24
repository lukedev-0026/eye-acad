import { z } from 'zod';

import { appendJsonl, readJsonl } from '@/common/jsonl.server';
import { EvalRefusedError } from '@/eval/eval.error';
import { resultsFile } from '@/eval/paths';

// The results of a run: one JSON row per line in evals/results/<run id>.jsonl.
// Rows are only ever added.

// Any saved row: an object that says what kind of row it is.
const SavedRowSchema = z.looseObject({ type: z.string().optional() });
export type SavedRow = z.infer<typeof SavedRowSchema>;

export async function appendRow(runId: string, row: object): Promise<void> {
  await appendJsonl(resultsFile(runId), row);
}

// A saved row of a known kind is checked against its shape. A file with a
// damaged row is refused by line, not half-read.
export function parseRow<T>(schema: z.ZodType<T>, row: unknown, file: string, line: number): T {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw new EvalRefusedError(`${file}, line ${line}, is not a valid row:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

// Every row of a results file, or none if it does not exist yet.
export async function readRows(file: string): Promise<Array<SavedRow>> {
  const rows = await readJsonl(file);
  return rows.map((row, i) => parseRow(SavedRowSchema, row, file, i + 1));
}
