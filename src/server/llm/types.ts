import { z } from 'zod'

// The five places the app calls a language model. Each is a separate,
// stateless call with its own settings.
export const STEP_IDS = [
  'selector',
  'followup',
  'coverage',
  'revision',
  'verifier',
] as const
export type StepId = (typeof STEP_IDS)[number]

export const PROMPT_VARIANTS = ['minimal', 'rules', 'examples'] as const
export type PromptVariant = (typeof PROMPT_VARIANTS)[number]

// Everything that can be varied about one model call. Nothing is left to a
// model default: an unset thinking switch or context size changes results
// silently.
export const StepSettingsSchema = z.object({
  provider: z.enum(['ollama', 'anthropic']),
  model: z.string().min(1),
  thinking: z.boolean(),
  // true: the provider enforces the JSON schema. false: the prompt asks for
  // it in words. The same check runs on the output either way.
  forceFormat: z.boolean(),
  promptVariant: z.enum(PROMPT_VARIANTS),
  // Ollama only. Current Claude models reject sampling settings.
  temperature: z.number().min(0).max(2).optional(),
  seed: z.number().int().optional(),
  sampling: z
    .object({
      top_p: z.number().optional(),
      top_k: z.number().optional(),
      presence_penalty: z.number().optional(),
    })
    .optional(),
  // Claude only.
  effort: z.enum(['low', 'medium', 'high']).optional(),
  maxOutputTokens: z.number().int().positive(),
  numCtx: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(120_000),
})
export type StepSettings = z.infer<typeof StepSettingsSchema>

export const StepsConfigSchema = z.object({
  steps: z.object({
    selector: StepSettingsSchema,
    followup: StepSettingsSchema,
    coverage: StepSettingsSchema,
    revision: StepSettingsSchema,
    verifier: StepSettingsSchema,
  }),
})
export type StepsConfig = z.infer<typeof StepsConfigSchema>

export type Prompt = { system: string; user: string }

// How a call ended. Only `ok` carries a value. Every other outcome maps to a
// fixed fallback in the app and to a failed run in the checks.
export type CallOutcome =
  | 'ok'
  | 'refusal'
  | 'truncated'
  | 'schema_invalid'
  | 'infra_error'

export type CallResult<T> = {
  outcome: CallOutcome
  value?: T
  rawText: string
  thinkingChars: number
  model: string
  provider: StepSettings['provider']
  // Wall-clock around the whole call, as the app experiences it.
  ms: number
  // The provider's own figures, where it reports them.
  server: {
    loadMs?: number
    promptEvalMs?: number
    evalMs?: number
    promptTokens?: number
    outputTokens?: number
  }
  error?: string
}

// What a provider adapter returns before the output is parsed and checked.
export type RawCall = {
  outcome: Exclude<CallOutcome, 'schema_invalid'>
  text: string
  thinkingChars: number
  model: string
  server: CallResult<unknown>['server']
  error?: string
}
