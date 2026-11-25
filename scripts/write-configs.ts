// pnpm sweep:configs  write config/steps.start.json and steps.small.json
import { writeFile } from 'node:fs/promises';

import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { runCli } from '@/eval/cli';
import { PATHS } from '@/eval/paths';
import { settingsFor, startSettings } from '@/eval/sweep/grid';

const asFile = (
  settings: (step: (typeof STEP_IDS)[number]) => StepSettings,
): string =>
  `${JSON.stringify({ steps: Object.fromEntries(STEP_IDS.map((step) => [step, settings(step)])) }, null, 2)}\n`;

await runCli(async () => {
  await writeFile(PATHS.startConfig, asFile(startSettings));
  await writeFile(
    PATHS.smallConfig,
    asFile((step) =>
      settingsFor(step, { size: 'small', thinking: false, forceFormat: true }),
    ),
  );
  console.log(`Wrote ${PATHS.startConfig} and ${PATHS.smallConfig}`);
});
