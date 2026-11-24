import { z } from 'zod';

import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepId } from '@/domain/llm/step-settings.schema';
import { EvalRefusedError } from '@/eval/eval.error';
import { SIZES } from '@/eval/sweep/grid';
import type { Size } from '@/eval/sweep/grid';

// Command-line arguments arrive as text. These turn them into checked values,
// or say what was wrong with them.

function parseList<T extends string>(option: string, text: string, allowed: ReadonlyArray<T>): Array<T> {
  const parsed = z.array(z.enum(allowed)).safeParse(text.split(',').filter(Boolean));
  if (!parsed.success) {
    throw new EvalRefusedError(`--${option} must be a comma-separated list of: ${allowed.join(', ')}`);
  }
  return parsed.data;
}

export const parseSteps = (text: string): Array<StepId> => parseList('steps', text, STEP_IDS);

export const parseSizes = (option: string, text: string): Array<Size> =>
  parseList(option, text, Object.keys(SIZES) as Array<Size>);

export function parseWholeNumber(option: string, text: string): number {
  const parsed = z.coerce.number().int().nonnegative().safeParse(text);
  if (!parsed.success) throw new EvalRefusedError(`--${option} must be a whole number, not "${text}"`);
  return parsed.data;
}

export function parseChoice<T extends string>(option: string, text: string, allowed: ReadonlyArray<T>): T {
  const parsed = z.enum(allowed).safeParse(text);
  if (!parsed.success) throw new EvalRefusedError(`--${option} must be one of: ${allowed.join(', ')}`);
  return parsed.data;
}
