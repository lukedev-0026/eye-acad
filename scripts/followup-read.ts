// The blind read of follow-up questions.
//   pnpm tsx scripts/followup-read.ts          write the sheet and its key
//   pnpm tsx scripts/followup-read.ts --score  read the filled-in sheet back
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { scoreFollowUpSheet, writeFollowUpSheet } from '@/eval/report/followup-read';
import { loadSweep } from '@/eval/sweep/sweep-data';

await runCli(async () => {
  const { values } = parseArgs({
    options: { score: { type: 'boolean', default: false }, 'run-id': { type: 'string', default: 'sweep-ollama' } },
  });
  if (values.score) await scoreFollowUpSheet(console.log);
  else await writeFollowUpSheet(await loadContext(), await loadSweep(values['run-id']), console.log);
});
