// Runs the existing checks across many configurations of each AI step, one
// model call at a time, writing every call to evals/results/<run-id>.jsonl.
// It can be stopped and restarted: finished work is skipped.
//
//   pnpm sweep --plan                 show what would run and a time estimate
//   pnpm sweep                        screen every configuration, then confirm the best
//   pnpm sweep --short                the cut-down plan that was actually run
//   pnpm sweep --budget-minutes 480   stop cleanly at a time budget
//   pnpm sweep --min-battery 20       stop cleanly before the battery gets low
//   pnpm sweep --steps selector,verifier --sizes small,medium
//   pnpm sweep --holdout              (later) the held-back cases, once only
import { parseArgs } from 'node:util';

import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import { runCli } from '@/eval/cli';
import { parseSizes, parseSteps, parseWholeNumber } from '@/eval/cli-args';
import { runSweep } from '@/eval/sweep/run-sweep';

await runCli(async () => {
  const { values } = parseArgs({
    options: {
      'run-id': { type: 'string', default: 'sweep-ollama' },
      steps: { type: 'string', default: STEP_IDS.join(',') },
      sizes: { type: 'string', default: 'small,medium,large' },
      'budget-minutes': { type: 'string', default: '540' },
      'min-battery': { type: 'string', default: '12' },
      plan: { type: 'boolean', default: false },
      holdout: { type: 'boolean', default: false },
      short: { type: 'boolean', default: false },
      'skip-block2': { type: 'boolean', default: false },
      'skip-confirm': { type: 'boolean', default: false },
    },
  });
  await runSweep(
    {
      runId: values['run-id'],
      steps: parseSteps(values.steps),
      sizes: parseSizes('sizes', values.sizes),
      budgetMinutes: parseWholeNumber('budget-minutes', values['budget-minutes']),
      minBatteryPercent: parseWholeNumber('min-battery', values['min-battery']),
      plan: values.plan,
      holdout: values.holdout,
      short: values.short,
      skipBlock2: values['skip-block2'],
      skipConfirm: values['skip-confirm'],
      argv: process.argv.slice(2),
    },
    console.log,
  );
});
