// Turns the sweep's recorded calls into evals/sweep/results.csv, applies the
// rule in evals/sweep/RULE.md, and prints the choice.
//   pnpm sweep:report            write the CSV and print the ranking
//   pnpm sweep:report --apply    also write the chosen settings to config/steps.json
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { reportSweep } from '@/eval/sweep/report-sweep';

await runCli(async () => {
  const { values } = parseArgs({
    options: { 'run-id': { type: 'string', default: 'sweep-ollama' }, apply: { type: 'boolean', default: false } },
  });
  await reportSweep({ runId: values['run-id'], apply: values.apply }, console.log);
});
