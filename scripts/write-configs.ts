// Writes the two reference settings files from the sweep's own definitions:
// config/steps.start.json (what the app was built on) and
// config/steps.small.json (the small model everywhere, to show where weak
// settings fail end to end).
import { writeFile } from 'node:fs/promises';

import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { runCli } from '@/eval/cli';
import { PATHS } from '@/eval/paths';
import { settingsFor, startSettings } from '@/eval/sweep/grid';

const asFile = (settings: (step: (typeof STEP_IDS)[number]) => StepSettings): string =>
  `${JSON.stringify({ steps: Object.fromEntries(STEP_IDS.map((step) => [step, settings(step)])) }, null, 2)}\n`;

await runCli(async () => {
  await writeFile(PATHS.startConfig, asFile(startSettings));
  await writeFile(
    PATHS.smallConfig,
    asFile((step) => settingsFor(step, { size: 'small', thinking: false, forceFormat: true })),
  );
  console.log(`Wrote ${PATHS.startConfig} and ${PATHS.smallConfig}`);
});
