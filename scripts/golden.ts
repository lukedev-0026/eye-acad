// pnpm golden                    compare with tests/golden/golden.json
// pnpm golden --update           rewrite that file (intended changes only)
// pnpm golden --capture-vectors  also fetch unpinned query vectors from Ollama
// pnpm golden --dump out.json    write every replayed outcome, to diff versions
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { runGolden } from '@/eval/golden/run-golden';

await runCli(async () => {
  const { values } = parseArgs({
    options: {
      update: { type: 'boolean', default: false },
      'capture-vectors': { type: 'boolean', default: false },
      dump: { type: 'string' },
      'run-id': { type: 'string', default: 'sweep-ollama' },
    },
  });
  await runGolden(
    {
      runId: values['run-id'],
      update: values.update,
      captureVectors: values['capture-vectors'],
      dump: values.dump,
    },
    console.log,
  );
});
