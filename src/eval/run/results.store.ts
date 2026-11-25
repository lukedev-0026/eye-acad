import { z } from 'zod';

import { appendJsonl, readJsonl } from '@/common/jsonl.server';
import { EvalRefusedError } from '@/eval/eval.error';
import { resultsFile } from '@/eval/paths';

const SavedRowSchema = z.looseObject({ type: z.string().optional() });
export type SavedRow = z.infer<typeof SavedRowSchema>;

export async function appendRow(runId: string, row: object): Promise<void> {
  await appendJsonl(resultsFile(runId), row);
}

/** Parses a saved row; a damaged row fails with its line number. */
export function parseRow<T>(
  schema: z.ZodType<T>,
  row: unknown,
  file: string,
  line: number,
): T {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw new EvalRefusedError(
      `${file}, line ${line}, is not a valid row:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export async function readRows(file: string): Promise<Array<SavedRow>> {
  const rows = await readJsonl(file);
  return rows.map((row, i) => parseRow(SavedRowSchema, row, file, i + 1));
}
