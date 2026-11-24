import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepId } from '@/domain/llm/step-settings.schema';

import { limitModels, rank } from './choosing-rule';
import type { Ranked } from './choosing-rule';
import { candidatesFor } from './sweep-data';
import type { SweepData } from './sweep-data';

export interface RuleOutcome {
  // Every configuration of a step that ran, best first.
  readonly ranked: Partial<Record<StepId, Array<Ranked>>>;
  readonly chosen: Partial<Record<StepId, Ranked>>;
  readonly stepsWithData: Array<StepId>;
  // Steps moved off their first choice to keep the app to two models.
  readonly changed: Array<StepId>;
  // True once every step has results, so the two-model limit could be applied.
  readonly complete: boolean;
}

// Applies the written rule (evals/sweep/RULE.md) to what the sweep recorded.
export function applyRule(data: SweepData): RuleOutcome {
  const ranked: Partial<Record<StepId, Array<Ranked>>> = {};
  const stepsWithData: Array<StepId> = [];
  for (const step of STEP_IDS) {
    // The rule is applied to configurations that had the confirmation runs. If
    // none has yet, the screening run is all there is, and the report says so.
    const confirmed = candidatesFor(data, step, ['screen', 'confirm']).filter(
      (c) =>
        c.summary.trialsPerCase >= 3 ||
        (c.settings.temperature === 0 &&
          c.summary.trialsPerCase >= 1 &&
          data.results.some((r) => r.configId === c.configId && r.stage === 'confirm')),
    );
    const pool = confirmed.length ? confirmed : candidatesFor(data, step, ['screen']);
    if (!pool.length) continue;
    stepsWithData.push(step);
    ranked[step] = rank(step, pool);
  }

  const complete = stepsWithData.length === STEP_IDS.length;
  if (complete) {
    const { chosen, changed } = limitModels(ranked as Record<StepId, Array<Ranked>>);
    return { ranked, chosen, stepsWithData, changed, complete };
  }
  const chosen: Partial<Record<StepId, Ranked>> = {};
  for (const step of stepsWithData) {
    const best = ranked[step]?.[0];
    if (best) chosen[step] = best;
  }
  return { ranked, chosen, stepsWithData, changed: [], complete };
}
