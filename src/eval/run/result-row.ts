import { z } from 'zod';

import { CALL_OUTCOMES } from '@/domain/llm/call-result';
import {
  STEP_IDS,
  StepSettingsSchema,
} from '@/domain/llm/step-settings.schema';
import { SPLITS } from '@/eval/eval-case.schema';

export const ResultRowSchema = z.object({
  type: z.literal('result'),
  runId: z.string(),
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
  secondary: z
    .object({ k: z.number(), n: z.number(), leftOut: z.number() })
    .optional(),
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

export const ChainRowSchema = ResultRowSchema.extend({
  step: z.literal('chain'),
});
export type ChainRow = z.infer<typeof ChainRowSchema>;

export const rowKey = (
  stage: string,
  cfg: string,
  caseId: string,
  trial: number,
): string => `${stage}|${cfg}|${caseId}|${trial}`;
