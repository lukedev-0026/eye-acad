// Writes the two reference settings files from the sweep's own definitions:
// config/steps.start.json (what the app was built on) and
// config/steps.small.json (the small model everywhere, to show where weak
// settings fail end to end).
import { writeFile } from 'node:fs/promises';

import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import { settingsFor, startSettings } from '@/eval/sweep/grid';

const file = (steps: Record<string, unknown>) => `${JSON.stringify({ steps }, null, 2)}\n`;
await writeFile('config/steps.start.json', file(Object.fromEntries(STEP_IDS.map((s) => [s, startSettings(s)]))));
await writeFile(
  'config/steps.small.json',
  file(
    Object.fromEntries(STEP_IDS.map((s) => [s, settingsFor(s, { size: 'small', thinking: false, forceFormat: true })])),
  ),
);
console.log('Wrote config/steps.start.json and config/steps.small.json');
