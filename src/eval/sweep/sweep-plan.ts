import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import type { Print } from '@/eval/cli';
import type { EvalCase } from '@/eval/eval.types';
import { configId } from '@/eval/run/config-id';

import { rank } from './choosing-rule';
import { CEILING_MS, SIZES, block2, settingsFor, sizeOf, startSettings, withoutPenalty } from './grid';
import type { Size } from './grid';
import { candidatesFor } from './sweep-data';
import type { SweepData } from './sweep-data';
import type { Preflight } from './sweep-rows.schema';

// Which configurations the sweep runs, and in which order. Planning needs no
// model: it reads what has been recorded so far and decides what comes next.

const CONFIRM_TOP = 3;
export const CONFIRM_TRIALS = 3;

export interface Planned {
  readonly step: StepId;
  readonly settings: StepSettings;
  // Which part of the plan this configuration belongs to.
  readonly block: string;
}

// Block 2 and the probes: from each size's best block-1 configuration, change
// one thing at a time; and re-run the start and the best without the model's
// repetition penalty.
export function block2For(data: SweepData, step: StepId, sizes: ReadonlyArray<Size>): Array<Planned> {
  const candidates = candidatesFor(data, step, ['screen']).filter((c) => c.block === 'block1' || c.block === 'start');
  const out: Array<Planned> = [];
  for (const size of sizes) {
    const best = rank(
      step,
      candidates.filter((c) => sizeOf(c.settings.model) === size),
    )[0];
    if (best && !best.stopped) {
      for (const settings of block2(step, best.settings)) out.push({ step, settings, block: 'block2' });
    }
  }
  const overall = rank(step, candidates)[0];
  out.push({ step, settings: withoutPenalty(step, startSettings(step)), block: 'probe' });
  if (overall && !overall.stopped) out.push({ step, settings: withoutPenalty(step, overall.settings), block: 'probe' });
  return out;
}

// The configurations that get the confirmation runs: the best three of a
// step's screening run, and the starting configuration if it is not among them.
export function finalists(data: SweepData, step: StepId): Array<StepSettings> {
  const top = rank(step, candidatesFor(data, step, ['screen']))
    .filter((c) => !c.stopped)
    .slice(0, CONFIRM_TOP)
    .map((c) => c.settings);
  const start = startSettings(step);
  return top.some((s) => configId(step, s) === configId(step, start)) ? top : [...top, start];
}

// The short sweep, run after the full plan proved too heavy for the machine's
// charger. One run per tuning case, thinking off throughout (every
// thinking-on configuration already recorded was far over its ceiling):
//   medium: format forced and not forced; then, one change at a time from the
//           starting configuration, the two other prompts and temperature 0
//   large:  format forced, minimal prompt
// The small model's block 1 was recorded in full before the cut.
export function shortPlan(steps: ReadonlyArray<StepId>): Array<Planned> {
  const planned: Array<Planned> = [];
  for (const step of steps) {
    const at = (change: Partial<Parameters<typeof settingsFor>[1]>): StepSettings =>
      settingsFor(step, { size: 'medium', thinking: false, forceFormat: true, ...change });
    planned.push({ step, settings: at({}), block: 'start' });
    planned.push({ step, settings: at({ forceFormat: false }), block: 'block1' });
    planned.push({ step, settings: at({ prompt: 'rules' }), block: 'block2' });
    planned.push({ step, settings: at({ prompt: 'examples' }), block: 'block2' });
    planned.push({ step, settings: at({ temperature: 0 }), block: 'block2' });
  }
  // The one step where thinking was both affordable and useful on the small
  // model was the support check, so it gets a thinking-on run here too.
  if (steps.includes('verifier')) {
    planned.push({
      step: 'verifier',
      settings: settingsFor('verifier', { size: 'medium', thinking: true, forceFormat: true }),
      block: 'block1',
    });
  }
  for (const step of steps) {
    planned.push({
      step,
      settings: settingsFor(step, { size: 'large', thinking: false, forceFormat: true }),
      block: 'block1',
    });
  }
  return planned;
}

// Rough weight of one call of each step against one selector call, from the
// first trial runs on the medium model.
const CALL_WEIGHT: Record<StepId, number> = { selector: 1, verifier: 2, followup: 4, revision: 4, coverage: 8 };
// Seconds per selector call, assumed until the pre-check has measured it.
const ASSUMED_OFF_MS: Record<Size, number> = { small: 800, medium: 1300, large: 3500 };
const ASSUMED_ON_MS: Record<Size, number> = { small: 5000, medium: 12000, large: 40000 };

export interface PlanInput {
  readonly runId: string;
  readonly steps: ReadonlyArray<StepId>;
  readonly sizes: ReadonlyArray<Size>;
  readonly tune: Readonly<Record<string, Array<EvalCase>>>;
  readonly holdout: Readonly<Record<string, Array<EvalCase>>>;
  readonly preflight: Preflight;
  readonly recordedCalls: number;
}

// What the full sweep would run, how many calls that is, and about how long
// it would take. Runs nothing.
export function printPlan(input: PlanInput, print: Print): void {
  let calls = 0;
  let seconds = 0;
  for (const step of input.steps) {
    const n = input.tune[step]?.length ?? 0;
    const b1 = input.sizes.length * 4;
    const b2 = input.sizes.length * 4 + 2;
    const confirm = (CONFIRM_TOP + 1) * (CONFIRM_TRIALS - 1);
    calls += n * (b1 + b2 + confirm);
    for (const size of input.sizes) {
      const probe = input.preflight.models?.[SIZES[size]]?.selectorMedianMs;
      const off = (probe?.thinkingOff ?? ASSUMED_OFF_MS[size]) / 1000;
      const on = Math.min((probe?.thinkingOn ?? ASSUMED_ON_MS[size]) / 1000, 60);
      // Thinking-on configurations over twice the ceiling stop after a few calls.
      const onCalls = on * CALL_WEIGHT[step] * 1000 > 2 * CEILING_MS[step] ? 4 : n;
      seconds += CALL_WEIGHT[step] * (2 * n * off + 2 * onCalls * on) + CALL_WEIGHT[step] * 4 * n * off;
    }
    seconds += CALL_WEIGHT[step] * confirm * n * 1.5;
    print(
      `${step}: ${n} tuning cases, ${input.holdout[step]?.length ?? 0} held back. ${b1} + ${b2} configurations, ${CONFIRM_TOP} + start confirmed.`,
    );
  }
  print(
    `\nAbout ${calls} calls. Estimated ${Math.round(seconds / 360) / 10} hours, from ${input.preflight.models ? 'the preflight timing probe' : 'assumed speeds (no preflight yet)'}.`,
  );
  print(`Already recorded in ${input.runId}: ${input.recordedCalls} calls.`);
}
