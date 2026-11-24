import { itemAt } from '@/common/arrays';
import { keysOf, recordOf } from '@/common/objects';
import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import type { Summary } from '@/eval/run/summarise';

import { CEILING_MS, SIZE_ORDER, sizeOf } from './grid';

// The rule that chooses the settings, as code. evals/sweep/RULE.md states it
// in words and was committed before the sweep ran; this file applies it. The
// report re-applies it to the results and must print what config/steps.json
// holds.

export interface Candidate {
  configId: string;
  settings: StepSettings;
  summary: Summary;
  stopped?: boolean;
}

export type Ranked = Candidate & {
  eligible: boolean;
  why: string;
  // 1 is the best group; configurations in the same tier are tied.
  tier: number;
};

// Two configurations are tied when their counts of cases passing every run
// differ by no more than one case, or 5% of the cases if that is larger.
export const tieBand = (cases: number): number => Math.max(1, Math.round(cases * 0.05));

// Simpler wins a tie: faster, then smaller model, thinking off, forced format
// on, temperature 0, the minimal prompt. Speeds within about 10% of each other
// count as the same speed (they are sorted into 10% bands), so that a few
// milliseconds of noise never decides between two configurations.
function simpler(a: Candidate, b: Candidate): number {
  const ms = (c: Candidate) =>
    c.summary.medianMs === null
      ? Number.POSITIVE_INFINITY
      : Math.round(Math.log(Math.max(1, c.summary.medianMs)) / Math.log(1.1));
  const size = (c: Candidate) => {
    const s = sizeOf(c.settings.model);
    return s === 'other' ? -1 : SIZE_ORDER.indexOf(s);
  };
  return (
    ms(a) - ms(b) ||
    size(a) - size(b) ||
    Number(a.settings.thinking) - Number(b.settings.thinking) ||
    Number(b.settings.forceFormat) - Number(a.settings.forceFormat) ||
    (a.settings.temperature ?? 0) - (b.settings.temperature ?? 0) ||
    (a.settings.promptVariant === 'minimal' ? 0 : 1) - (b.settings.promptVariant === 'minimal' ? 0 : 1)
  );
}

export function rank(step: StepId, candidates: Array<Candidate>, options: { ceilingMs?: number } = {}): Array<Ranked> {
  const ceiling = options.ceilingMs ?? CEILING_MS[step];
  const judged = candidates.map((c) => {
    const tooSlow = c.stopped || c.summary.medianMs === null || c.summary.medianMs > ceiling;
    const eligible = !tooSlow && c.summary.costly === 0 && c.summary.cases > 0;
    const why = c.stopped
      ? 'stopped: far over the speed ceiling'
      : tooSlow
        ? `median ${c.summary.medianMs} ms is over the ${ceiling} ms ceiling`
        : c.summary.costly > 0
          ? `${c.summary.costly} costly error${c.summary.costly === 1 ? '' : 's'}`
          : 'eligible';
    return { ...c, eligible, why };
  });

  // 1. Eligible: no costly error and under the ceiling. If nothing is
  //    eligible, the fewest costly errors among those under the ceiling (or
  //    among all, if none is) is used, and the write-up says so.
  let pool = judged.filter((c) => c.eligible);
  if (pool.length === 0) {
    const underCeiling = judged.filter(
      (c) => !c.stopped && c.summary.medianMs !== null && c.summary.medianMs <= ceiling,
    );
    const from = underCeiling.length ? underCeiling : judged.filter((c) => !c.stopped);
    const fewest = Math.min(...from.map((c) => c.summary.costly));
    pool = from.filter((c) => c.summary.costly === fewest);
  }
  const inPool = new Set(pool.map((c) => c.configId));

  // 2. Most cases passing on every run, with near-equal counts tied.
  const best = Math.max(0, ...pool.map((c) => c.summary.casesAllPass));
  const cases = Math.max(1, ...pool.map((c) => c.summary.cases));
  const band = tieBand(cases);
  return (
    judged
      .map((c) => {
        const gap = best - c.summary.casesAllPass;
        const tier = !inPool.has(c.configId) ? 1000 : gap <= band ? 1 : 1 + Math.ceil(gap / band);
        return { ...c, tier };
      })
      // 3. Within a tier, the simpler configuration first.
      .sort((a, b) => a.tier - b.tier || simpler(a, b) || a.configId.localeCompare(b.configId))
  );
}

// 4. At most two models across the five steps. If the winners need three, the
//    step on the least-used model takes its best configuration on one of the
//    other two.
export function limitModels(
  ranked: Record<StepId, Array<Ranked>>,
  maxModels = 2,
): { chosen: Record<StepId, Ranked>; changed: Array<StepId> } {
  const steps = keysOf(ranked);
  const chosen = recordOf(steps, (s) => itemAt(ranked[s], 0));
  const changed: Array<StepId> = [];
  for (;;) {
    const use = new Map<string, Array<StepId>>();
    for (const s of steps) use.set(chosen[s].settings.model, [...(use.get(chosen[s].settings.model) ?? []), s]);
    if (use.size <= maxModels) break;
    const least = [...use.entries()].sort((a, b) => a[1].length - b[1].length)[0];
    if (!least) break;
    const [leastUsed, itsSteps] = least;
    for (const s of itsSteps) {
      const alternative = ranked[s].find((c) => c.settings.model !== leastUsed && use.has(c.settings.model));
      if (!alternative) return { chosen, changed };
      chosen[s] = alternative;
      changed.push(s);
    }
  }
  return { chosen, changed };
}
