// Runs every AI-backed check through the app's real code on the configured
// settings, writes one row per model call to evals/results/, and regenerates
// CHECKS.md from those rows.
//   pnpm check                      everything, on the tuning cases
//   pnpm check --only required      just the brief's three checks
//   pnpm check --steps selector     just one step's case set
//   pnpm check --config config/steps.start.json --trials 1
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
      'no-report': { type: 'boolean', default: false },
    },
  });
  const onlyRequired = values.only === 'required';
  await runChecks(
    {
      configFile: values.config,
      steps: onlyRequired ? [] : values.steps ? parseSteps(values.steps) : [...STEP_IDS],
      required: onlyRequired || (!values.steps && values.only !== 'steps'),
      requiredNames: values.required?.split(',') ?? null,
      chain: !values.steps && !onlyRequired,
      trials: parseWholeNumber('trials', values.trials),
      split: parseChoice('split', values.split, ['tune', 'holdout', 'all']),
      report: !values['no-report'],
    },
    console.log,
    toStdout,
  );
});
