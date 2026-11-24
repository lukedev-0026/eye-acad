// Runs every AI-backed check through the app's real code on the configured
// settings, writes one row per model call to evals/results/, and regenerates
// CHECKS.md from those rows.
//   pnpm check                      everything, on the tuning cases
//   pnpm check --only required      just the brief's three checks
//   pnpm check --steps selector     just one step's case set
//   pnpm check --only chain         just the revision step and support check together
//   pnpm check --config config/steps.start.json --report evals/checks/start.md
import { parseArgs } from 'node:util';

import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import { runChecks } from '@/eval/checks/run-checks';
import { runCli, toStdout } from '@/eval/cli';
import { parseChoice, parseSteps, parseWholeNumber } from '@/eval/cli-args';
import { PATHS } from '@/eval/paths';

await runCli(async () => {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: PATHS.stepsConfig },
      steps: { type: 'string' },
      only: { type: 'string' },
      trials: { type: 'string', default: '3' },
      split: { type: 'string', default: 'tune' },
      required: { type: 'string' },
      // Where the report goes. CHECKS.md is the one for the app's own settings.
      report: { type: 'string', default: PATHS.checksMarkdown },
      'no-report': { type: 'boolean', default: false },
      // Stop cleanly before the next part of the run if the battery is under this.
      'min-battery': { type: 'string', default: '15' },
    },
  });
  // --only narrows the run to one part: the brief's checks, the five steps'
  // case sets (with the chain), or the chain alone.
  const only = values.only === undefined ? null : parseChoice('only', values.only, ['required', 'steps', 'chain']);
  const stepsRun =
    only === 'required' || only === 'chain' ? [] : values.steps ? parseSteps(values.steps) : [...STEP_IDS];
  await runChecks(
    {
      configFile: values.config,
      steps: stepsRun,
      required: only === 'required' || (only === null && !values.steps),
      requiredNames: values.required?.split(',') ?? null,
      chain: only === 'chain' || (only !== 'required' && !values.steps),
      trials: parseWholeNumber('trials', values.trials),
      split: parseChoice('split', values.split, ['tune', 'holdout', 'all']),
      report: values['no-report'] ? null : values.report,
      minBatteryPercent: parseWholeNumber('min-battery', values['min-battery']),
    },
    console.log,
    toStdout,
  );
});
