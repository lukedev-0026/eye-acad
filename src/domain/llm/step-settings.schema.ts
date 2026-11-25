import { z } from 'zod';

export const STEP_IDS = [
  'selector',
  'followup',
  'coverage',
  'revision',
  'verifier',
] as const;
export type StepId = (typeof STEP_IDS)[number];

const PROMPT_VARIANTS = ['minimal', 'rules', 'examples'] as const;
export type PromptVariant = (typeof PROMPT_VARIANTS)[number];

export const StepSettingsSchema = z.object({
  provider: z.enum(['ollama', 'anthropic']),
  model: z.string().min(1),
  thinking: z.boolean(),
  forceFormat: z.boolean(),
  promptVariant: z.enum(PROMPT_VARIANTS),
  // Ollama only: current Claude models reject sampling settings.
  temperature: z.number().min(0).max(2).optional(),
  seed: z.number().int().optional(),
  sampling: z
    .object({
      top_p: z.number().optional(),
      top_k: z.number().optional(),
      presence_penalty: z.number().optional(),
    })
    .optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  maxOutputTokens: z.number().int().positive(),
  numCtx: z.number().int().positive().optional(),
  improvements: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().default(120_000),
});
export type StepSettings = z.infer<typeof StepSettingsSchema>;

export const StepsConfigSchema = z.object({
  steps: z.object({
    selector: StepSettingsSchema,
    followup: StepSettingsSchema,
    coverage: StepSettingsSchema,
    revision: StepSettingsSchema,
    verifier: StepSettingsSchema,
  }),
});
export type StepsConfig = z.infer<typeof StepsConfigSchema>;
