import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import type { Print } from '@/eval/cli';
import type { EvalCase } from '@/eval/eval.types';
import { configId } from '@/eval/run/config-id';

import { rank } from './choosing-rule';
import {
  CEILING_MS,
  SIZES,
  block2,
  settingsFor,
  sizeOf,
  startSettings,
  withoutPenalty,
} from './grid';
import type { Size } from './grid';
import { candidatesFor } from './sweep-data';
import type { SweepData } from './sweep-data';
import type { Preflight } from './sweep-rows.schema';

const CONFIRM_TOP = 3;
export const CONFIRM_TRIALS = 3;

export interface Planned {
  readonly step: StepId;
  readonly settings: StepSettings;
  readonly block: string;
}

/** Block 2 from each size's best, plus start and best without the penalty. */
export function block2For(
  data: SweepData,
  step: StepId,
  sizes: ReadonlyArray<Size>,
): Array<Planned> {
  const candidates = candidatesFor(data, step, ['screen']).filter(
    (c) => c.block === 'block1' || c.block === 'start',
  );
  const out: Array<Planned> = [];
  for (const size of sizes) {
    const best = rank(
      step,
      candidates.filter((c) => sizeOf(c.settings.model) === size),
    )[0];
    if (best && !best.stopped) {
      for (const settings of block2(step, best.settings))
        out.push({ step, settings, block: 'block2' });
    }
  }
  const overall = rank(step, candidates)[0];
  out.push({
    step,
    settings: withoutPenalty(step, startSettings(step)),
    block: 'probe',
  });
  if (overall && !overall.stopped)
    out.push({
      step,
      settings: withoutPenalty(step, overall.settings),
      block: 'probe',
    });
  return out;
}

/** A step's best three screening configurations, plus the start if missing. */
export function finalists(data: SweepData, step: StepId): Array<StepSettings> {
  const top = rank(step, candidatesFor(data, step, ['screen']))
    .filter((c) => !c.stopped)
    .slice(0, CONFIRM_TOP)
    .map((c) => c.settings);
  const start = startSettings(step);
  return top.some((s) => configId(step, s) === configId(step, start))
    ? top
    : [...top, start];
}

/**
 * The cut-down sweep: one run per tuning case, thinking off (every
 * thinking-on configuration recorded was far over its ceiling).
 */
export function shortPlan(steps: ReadonlyArray<StepId>): Array<Planned> {
  const planned: Array<Planned> = [];
  for (const step of steps) {
    const at = (
      change: Partial<Parameters<typeof settingsFor>[1]>,
    ): StepSettings =>
      settingsFor(step, {
        size: 'medium',
        thinking: false,
        forceFormat: true,
        ...change,
      });
    planned.push({ step, settings: at({}), block: 'start' });
    planned.push({
      step,
      settings: at({ forceFormat: false }),
      block: 'block1',
    });
    planned.push({ step, settings: at({ prompt: 'rules' }), block: 'block2' });
    planned.push({
      step,
      settings: at({ prompt: 'examples' }),
      block: 'block2',
    });
    planned.push({ step, settings: at({ temperature: 0 }), block: 'block2' });
  }
  if (steps.includes('verifier')) {
    planned.push({
      step: 'verifier',
      settings: settingsFor('verifier', {
        size: 'medium',
        thinking: true,
        forceFormat: true,
      }),
      block: 'block1',
    });
  }
  for (const step of steps) {
    planned.push({
      step,
      settings: settingsFor(step, {
        size: 'large',
        thinking: false,
        forceFormat: true,
      }),
      block: 'block1',
    });
  }
  return planned;
}

// Cost of one call relative to a selector call.
const CALL_WEIGHT: Record<StepId, number> = {
  selector: 1,
  verifier: 2,
  followup: 4,
  revision: 4,
  coverage: 8,
};
const ASSUMED_OFF_MS: Record<Size, number> = {
  small: 800,
  medium: 1300,
  large: 3500,
};
const ASSUMED_ON_MS: Record<Size, number> = {
  small: 5000,
  medium: 12000,
  large: 40000,
};

export interface PlanInput {
  readonly runId: string;
  readonly steps: ReadonlyArray<StepId>;
  readonly sizes: ReadonlyArray<Size>;
  readonly tune: Readonly<Record<string, Array<EvalCase>>>;
  readonly holdout: Readonly<Record<string, Array<EvalCase>>>;
  readonly preflight: Preflight;
  readonly recordedCalls: number;
}

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
      const on = Math.min(
        (probe?.thinkingOn ?? ASSUMED_ON_MS[size]) / 1000,
        60,
      );
      const onCalls =
        on * CALL_WEIGHT[step] * 1000 > 2 * CEILING_MS[step] ? 4 : n;
      seconds +=
        CALL_WEIGHT[step] * (2 * n * off + 2 * onCalls * on) +
        CALL_WEIGHT[step] * 4 * n * off;
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
