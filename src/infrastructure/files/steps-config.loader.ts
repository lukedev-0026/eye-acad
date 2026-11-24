import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { StepsConfigSchema } from '@/domain/llm/step-settings.schema';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';

// Which model and settings each step uses. Read on every request, so changing
// a setting needs no restart and no code change.
export async function loadStepsConfig(file?: string): Promise<StepsConfig> {
  const target = path.resolve(process.cwd(), file ?? process.env.VIVA_STEPS_FILE ?? 'config/steps.json');
  const parsed = StepsConfigSchema.safeParse(JSON.parse(await readFile(target, 'utf8')));
  if (!parsed.success) {
    throw new Error(`${target} is not a valid settings file:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
