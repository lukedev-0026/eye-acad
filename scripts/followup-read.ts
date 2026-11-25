// pnpm followup:read --runs start=<run>,chosen=<run>  write sheet + key
// pnpm followup:read --score                          read the filled sheet
import { parseArgs } from 'node:util';

import { readCheckRun } from '@/eval/checks/check-run';
import { runCli } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { EvalRefusedError } from '@/eval/eval.error';
import { resultsFile } from '@/eval/paths';
import {
  scoreFollowUpSheet,
  writeFollowUpSheet,
} from '@/eval/report/followup-read';
import type { FollowUpSource } from '@/eval/report/followup-read';

async function readSources(runs: string): Promise<Array<FollowUpSource>> {
  const sources: Array<FollowUpSource> = [];
  for (const pair of runs.split(',')) {
    const [label, runId] = pair.split('=').map((part) => part.trim());
    if (!label || !runId)
      throw new EvalRefusedError(
        `--runs takes name=run-id pairs, separated by commas. Got "${pair}".`,
      );
    const run = await readCheckRun(resultsFile(runId));
    if (run.results.length === 0)
      throw new EvalRefusedError(`No results found for run ${runId}.`);
    sources.push({ label, rows: run.results });
  }
  return sources;
}

await runCli(async () => {
  const { values } = parseArgs({
    options: {
      score: { type: 'boolean', default: false },
      runs: { type: 'string' },
    },
  });
  if (values.score) {
    await scoreFollowUpSheet(console.log);
    return;
  }
  if (!values.runs)
    throw new EvalRefusedError(
      'Say which runs to read: --runs start=<run id>,chosen=<run id>',
    );
  await writeFollowUpSheet(
    await loadContext(),
    await readSources(values.runs),
    console.log,
  );
});
