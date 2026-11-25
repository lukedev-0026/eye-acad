// pnpm sweep:report          write the CSV and print the ranking
// pnpm sweep:report --apply  also write the chosen settings to config/
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { reportSweep } from '@/eval/sweep/report-sweep';

await runCli(async () => {
  const { values } = parseArgs({
    options: {
      'run-id': { type: 'string', default: 'sweep-ollama' },
      apply: { type: 'boolean', default: false },
    },
  });
  await reportSweep(
    { runId: values['run-id'], apply: values.apply },
    console.log,
  );
});
