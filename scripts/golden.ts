// Checks that the app still sends the model exactly what it sent before, and
// still makes exactly the same of every reply a model has given it. Runs
// offline: the network is replaced by a recorder.
//
//   pnpm golden                    compare with tests/golden/golden.json
//   pnpm golden --update           rewrite that file (only for a change that is meant)
//   pnpm golden --capture-vectors  also ask Ollama for any query vector not yet pinned
//   pnpm golden --dump out.json    write every replayed outcome, for comparing two versions
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
