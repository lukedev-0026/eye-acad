// Draws evals/sweep/chart-<provider>.svg from evals/sweep/results.csv and
// nothing else: accuracy against model call time, one dot per configuration,
// one panel per AI step.
//   pnpm sweep:chart
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { runCli } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { EvalRefusedError } from '@/eval/eval.error';
import { PATHS, chartFile } from '@/eval/paths';
import { parseCsv } from '@/eval/report/csv';
import { chartFloors, sweepChartSvg } from '@/eval/report/sweep-chart';

await runCli(async () => {
  const { values } = parseArgs({ options: { provider: { type: 'string', default: 'ollama' } } });
  const rows = parseCsv(await readFile(PATHS.resultsCsv, 'utf8')).filter(
    (r) => r.provider === values.provider && r.stage === 'screen' && r.split === 'tune',
  );
  if (!rows.length) {
    throw new EvalRefusedError(`No screening results in ${PATHS.resultsCsv}. Run: pnpm sweep, then pnpm sweep:report`);
  }
  const file = chartFile(values.provider);
  await writeFile(file, sweepChartSvg(rows, await chartFloors(await loadContext())));
  console.log(`Wrote ${file}: ${rows.length} configurations across ${new Set(rows.map((r) => r.step)).size} steps.`);
});
