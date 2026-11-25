// pnpm sweep:preflight                        check graders, settings
// pnpm sweep:preflight --models small,medium  only these models
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { parseSizes } from '@/eval/cli-args';
import { runPreflight } from '@/eval/sweep/preflight';

await runCli(async () => {
  const { values } = parseArgs({
    options: { models: { type: 'string', default: 'small,medium,large' } },
  });
  await runPreflight(
    { sizes: parseSizes('models', values.models) },
    console.log,
  );
});
