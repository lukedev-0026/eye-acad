import { appendJsonl, readJsonl } from '@/common/jsonl.server';
import { resultsFile } from '@/eval/paths';

// The results of a run: one JSON row per line in evals/results/<run id>.jsonl.
// Rows are only ever added.

export async function appendRow(runId: string, row: Record<string, unknown>): Promise<void> {
  await appendJsonl(resultsFile(runId), row);
}

// Every row of a results file, or none if it does not exist yet.
export async function readRows(file: string): Promise<Array<Record<string, unknown>>> {
  return (await readJsonl(file)) as Array<Record<string, unknown>>;
}
