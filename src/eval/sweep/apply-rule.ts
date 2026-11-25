import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepId } from '@/domain/llm/step-settings.schema';

import { limitModels, rank } from './choosing-rule';
import type { Ranked } from './choosing-rule';
import { candidatesFor } from './sweep-data';
import type { SweepData } from './sweep-data';

export interface RuleOutcome {
  readonly ranked: Partial<Record<StepId, Array<Ranked>>>;
  readonly chosen: Partial<Record<StepId, Ranked>>;
  readonly stepsWithData: Array<StepId>;
  readonly changed: Array<StepId>;
  readonly complete: boolean;
}

const hasEveryStep = (
  ranked: Partial<Record<StepId, Array<Ranked>>>,
): ranked is Record<StepId, Array<Ranked>> =>
  STEP_IDS.every((step) => ranked[step] !== undefined);

/** Applies the rule in evals/sweep/RULE.md to what the sweep recorded. */
export function applyRule(data: SweepData): RuleOutcome {
  const ranked: Partial<Record<StepId, Array<Ranked>>> = {};
  const stepsWithData: Array<StepId> = [];
  for (const step of STEP_IDS) {
    const confirmed = candidatesFor(data, step, ['screen', 'confirm']).filter(
      (c) =>
        c.summary.trialsPerCase >= 3 ||
        (c.settings.temperature === 0 &&
          c.summary.trialsPerCase >= 1 &&
          data.results.some(
            (r) => r.configId === c.configId && r.stage === 'confirm',
          )),
    );
    const pool = confirmed.length
      ? confirmed
      : candidatesFor(data, step, ['screen']);
    if (!pool.length) continue;
    stepsWithData.push(step);
    ranked[step] = rank(step, pool);
  }

  if (hasEveryStep(ranked)) {
    const { chosen, changed } = limitModels(ranked);
    return { ranked, chosen, stepsWithData, changed, complete: true };
  }
  const chosen: Partial<Record<StepId, Ranked>> = {};
  for (const step of stepsWithData) {
    const best = ranked[step]?.[0];
    if (best) chosen[step] = best;
  }
  return { ranked, chosen, stepsWithData, changed: [], complete: false };
}
