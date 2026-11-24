import { z } from 'zod';

import { STEP_IDS, StepSettingsSchema } from '@/domain/llm/step-settings.schema';

// The rows the sweep saves besides its results.

// One configuration that was planned, and which block of the plan it is from.
export const ConfigRowSchema = z.object({
  type: z.literal('config'),
  configId: z.string(),
  step: z.enum(STEP_IDS),
  settings: StepSettingsSchema,
  block: z.string(),
});
export type ConfigRow = z.infer<typeof ConfigRowSchema>;

// Whether a configuration ran to the end or was stopped as far too slow.
export const StatusRowSchema = z.object({
  type: z.literal('config_status'),
  configId: z.string(),
  stage: z.string(),
  status: z.enum(['complete', 'stopped']),
});

// The machine, at the start of a run.
export const RunRowSchema = z.looseObject({
  type: z.literal('run'),
  at: z.string().optional(),
  env: z
    .looseObject({
      commit: z.string().optional(),
      ollamaVersion: z.string().optional(),
      powerMode: z.string().optional(),
      machine: z.string().optional(),
      memoryGb: z.number().nullish(),
    })
    .optional(),
});
export type RunRow = z.infer<typeof RunRowSchema>;

export const ModelLoadedRowSchema = z.looseObject({
  type: z.literal('model_loaded'),
  model: z.string(),
  loadAndWarmUpMs: z.number(),
  info: z
    .looseObject({ digest: z.string().optional(), engine: z.string().optional(), quantisation: z.string().optional() })
    .nullish(),
});
export type ModelLoadedRow = z.infer<typeof ModelLoadedRowSchema>;

// What the pre-check recorded for each model, as far as the report reads it.
export const PreflightSchema = z.looseObject({
  models: z
    .record(
      z.string(),
      z.looseObject({
        canaries: z.record(z.string(), z.looseObject({ outcome: z.string() })).optional(),
        selectorMedianMs: z.object({ thinkingOff: z.number(), thinkingOn: z.number() }).optional(),
      }),
    )
    .optional(),
});
export type Preflight = z.infer<typeof PreflightSchema>;
