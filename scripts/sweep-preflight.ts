// The pre-check: the graders pass their own expected answers, and each setting
// is shown to take effect on each model. Writes evals/sweep/preflight.json.
//   pnpm sweep:preflight
//   pnpm sweep:preflight --models small,medium
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { parseSizes } from '@/eval/cli-args';
import { runPreflight } from '@/eval/sweep/preflight';

await runCli(async () => {
  const { values } = parseArgs({ options: { models: { type: 'string', default: 'small,medium,large' } } });
  await runPreflight({ sizes: parseSizes('models', values.models) }, console.log);
});
