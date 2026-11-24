import type { PromptVariant, StepId, StepSettings } from '../server/llm/types';

// The configurations the sweep runs. A full grid would be 108 per step (3
// sizes x 3 temperatures x thinking x forced format x 3 prompts); this runs
// about 26 per step and says so.

export const SIZES = { small: 'qwen3.5:4b', medium: 'qwen3.5:9b', large: 'qwen3.5:27b' } as const;
export type Size = keyof typeof SIZES;
export const SIZE_ORDER: Array<Size> = ['small', 'medium', 'large'];
export const sizeOf = (model: string): Size | 'other' =>
  (Object.entries(SIZES).find(([, m]) => m === model)?.[0] as Size | undefined) ?? 'other';

export const TEMPERATURES = [0, 0.7, 1] as const;
export const PROMPTS: Array<PromptVariant> = ['minimal', 'rules', 'examples'];

// One context size for every call, so a model is never reloaded between steps
// and no prompt is silently cut short.
export const NUM_CTX = 8192;

// Room for the reply. Thinking is counted against the same cap, so it gets
// more.
const OUTPUT_CAP: Record<StepId, number> = {
  selector: 400,
  followup: 600,
  coverage: 1500,
  revision: 800,
  verifier: 300,
};
const THINKING_ALLOWANCE = 3000;

// Median model call time, on this machine, above which a configuration is not
// eligible. Selector and follow-up are waited on by a trainee who is about to
// hear the examiner; the other three run after the viva. These are judgement
// calls, fixed in evals/sweep/RULE.md before any result was seen.
export const CEILING_MS: Record<StepId, number> = {
  selector: 2000,
  followup: 5000,
  coverage: 15000,
  revision: 15000,
  verifier: 15000,
};

// The model card's recommended sampling for each thinking mode. Only
// temperature is swept; the rest is written out and held.
const CARD = {
  off: { temperature: 0.7, sampling: { top_p: 0.8, top_k: 20, presence_penalty: 1.5 } },
  on: { temperature: 1, sampling: { top_p: 0.95, top_k: 20, presence_penalty: 1.5 } },
} as const;

export function settingsFor(
  step: StepId,
  o: {
    size: Size;
    thinking: boolean;
    forceFormat: boolean;
    temperature?: number;
    prompt?: PromptVariant;
    presencePenalty?: number;
  },
): StepSettings {
  const card = CARD[o.thinking ? 'on' : 'off'];
  return {
    provider: 'ollama',
    model: SIZES[o.size],
    thinking: o.thinking,
    forceFormat: o.forceFormat,
    promptVariant: o.prompt ?? 'minimal',
    temperature: o.temperature ?? card.temperature,
    sampling: { ...card.sampling, ...(o.presencePenalty === undefined ? {} : { presence_penalty: o.presencePenalty }) },
    maxOutputTokens: OUTPUT_CAP[step] + (o.thinking ? THINKING_ALLOWANCE : 0),
    numCtx: NUM_CTX,
    // A call that takes four times the step's ceiling could never be chosen,
    // so it is cut off there and counted as a failed run.
    timeoutMs: Math.max(30_000, 4 * CEILING_MS[step]),
  };
}

// The configuration the app was built on. One dot among the rest.
export const startSettings = (step: StepId) =>
  settingsFor(step, { size: 'medium', thinking: false, forceFormat: true });

// Block 1: every combination of size, thinking and forced format, at the
// card's temperature, with the minimal prompt. Twelve per step.
export function block1(step: StepId, size: Size): Array<StepSettings> {
  return [false, true].flatMap((thinking) =>
    [true, false].map((forceFormat) => settingsFor(step, { size, thinking, forceFormat })),
  );
}

// Block 2: from the best block-1 configuration of a size, change one thing at
// a time: the two other temperatures, and the two other prompts.
export function block2(step: StepId, best: StepSettings): Array<StepSettings> {
  const size = sizeOf(best.model) as Size;
  const same = { size, thinking: best.thinking, forceFormat: best.forceFormat };
  return [
    ...TEMPERATURES.filter((t) => t !== best.temperature).map((temperature) =>
      settingsFor(step, { ...same, temperature }),
    ),
    ...PROMPTS.filter((p) => p !== best.promptVariant).map((prompt) => settingsFor(step, { ...same, prompt })),
  ];
}

// The model ships with a repetition penalty. It may discourage naming the same
// finding twice (once for each eye), so two configurations are re-run without it.
export function withoutPenalty(step: StepId, s: StepSettings): StepSettings {
  return settingsFor(step, {
    size: sizeOf(s.model) as Size,
    thinking: s.thinking,
    forceFormat: s.forceFormat,
    temperature: s.temperature,
    prompt: s.promptVariant,
    presencePenalty: 0,
  });
}

export function describe(s: StepSettings): string {
  return [
    sizeOf(s.model),
    s.thinking ? 'thinking on' : 'thinking off',
    s.forceFormat ? 'format forced' : 'format not forced',
    `temp ${s.temperature}`,
    `${s.promptVariant} prompt`,
    ...(s.sampling?.presence_penalty === 0 ? ['no penalty'] : []),
  ].join(', ');
}
