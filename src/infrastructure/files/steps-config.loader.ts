import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { errorMessage } from '@/common/errors/to-error';
import { InvalidSettingsFileError } from '@/config/config.error';
import { getConfig } from '@/config/env.server';
import { StepsConfigSchema } from '@/domain/llm/step-settings.schema';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';

// Which model and settings each step uses. Read on every request, so changing
// a setting needs no restart and no code change.
//
// `file` names another settings file, relative to the project folder; the
// checks use it to run the same code on other settings.
export async function loadStepsConfig(file?: string): Promise<StepsConfig> {
  const target = file === undefined ? getConfig().files.stepsFile : path.resolve(process.cwd(), file);
  let json: unknown;
  try {
    json = JSON.parse(await readFile(target, 'utf8'));
  } catch (error) {
    throw new InvalidSettingsFileError(target, errorMessage(error), { cause: error });
  }
  const parsed = StepsConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidSettingsFileError(target, z.prettifyError(parsed.error), { cause: parsed.error });
  }
  return parsed.data;
}
