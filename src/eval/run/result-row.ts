import { z } from 'zod';

import { CALL_OUTCOMES } from '@/domain/llm/call-result';
import { STEP_IDS, StepSettingsSchema } from '@/domain/llm/step-settings.schema';
import { SPLITS } from '@/eval/eval-case.schema';

// One model call, as it is saved: what was asked, with which settings, what
// came back, and how it was graded. `observed` and `raw` are what the model
// produced, so a row can be graded again without running the model again.
export const ResultRowSchema = z.object({
  type: z.literal('result'),
  runId: z.string(),
  // screen, confirm, holdout, check, or a timing reference (sentinel-A, ...).
  stage: z.string(),
  at: z.string(),
  step: z.enum(STEP_IDS),
  configId: z.string(),
  settings: StepSettingsSchema,
  split: z.enum(SPLITS),
  caseId: z.string(),
  caseType: z.string(),
  trial: z.number().int(),
  seed: z.number().nullable(),
  outcome: z.enum(CALL_OUTCOMES),
  pass: z.boolean(),
  costly: z.boolean(),
  fallback: z.boolean(),
  detail: z.string(),
  secondary: z.object({ k: z.number(), n: z.number(), leftOut: z.number() }).optional(),
  // Wall-clock for the whole step, retries included.
  ms: z.number(),
  modelMs: z.number(),
  calls: z.number(),
  promptTokens: z.number(),
  outputTokens: z.number(),
  thinkingChars: z.number(),
  model: z.string(),
  observed: z.unknown(),
  raw: z.string(),
});
export type ResultRow = z.infer<typeof ResultRowSchema>;

// The revision step and the support check run together (`pnpm check`) are
// saved in the same form, under a step name of their own.
export const ChainRowSchema = ResultRowSchema.extend({ step: z.literal('chain') });
export type ChainRow = z.infer<typeof ChainRowSchema>;

// What makes a saved row the same piece of work as one about to be run.
export const rowKey = (stage: string, cfg: string, caseId: string, trial: number): string =>
  `${stage}|${cfg}|${caseId}|${trial}`;
