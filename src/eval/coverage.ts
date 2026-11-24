import { coverageItems, runCoverage } from '../server/coverage.server';
import type { Status } from '../server/coverage.server';
import { readCases } from './context';
import { asRun } from './selector';
import type { StepEval } from './types';

type Input = { answer: string };
type Expect = { acceptableTargets: Array<string>; statuses: Record<string, Status | 'either'> };
type Observed = { target: string; statuses: Record<string, Status>; chosenBy: string | null };

export const coverageEval: StepEval<Input, Expect, Observed> = {
  step: 'coverage',
  cases: () => readCases<Input, Expect>('coverage.jsonl'),

  async run(c, settings, ctx) {
    const result = await runCoverage(ctx.notes, c.input.answer, settings);
    return asRun(result.call, {
      target: result.call.outcome !== 'ok' ? 'error' : (result.target?.id ?? 'none'),
      statuses: Object.fromEntries(result.items.map((i) => [i.id, i.status])),
      chosenBy: result.targetChosenBy,
    });
  },

  // The case passes when the gap the trainee would be shown is a defensible
  // one. Agreement item by item is kept as a second count.
  grade(c, observed) {
    const ids = Object.keys(c.expect.statuses);
    const counted = ids.filter((id) => c.expect.statuses[id] !== 'either');
    const agree = counted.filter((id) => observed.statuses[id] === c.expect.statuses[id]);
    // A point the answer missed, marked as covered: that gap is never raised.
    const hidden = ids.filter((id) => c.expect.statuses[id] === 'not_covered' && observed.statuses[id] === 'covered');
    const pass = c.expect.acceptableTargets.includes(observed.target);
    return {
      pass,
      costly: hidden.length > 0,
      fallback: false,
      secondary: { k: agree.length, n: counted.length, leftOut: ids.length - counted.length },
      detail:
        `target ${observed.target}${pass ? '' : ` (acceptable: ${c.expect.acceptableTargets.join(', ')})`}; ` +
        `items agreed ${agree.length} of ${counted.length}` +
        (hidden.length ? `; missed but marked covered: ${hidden.join(', ')}` : ''),
    };
  },

  ideal: (c) => ({
    target: c.expect.acceptableTargets[0],
    statuses: Object.fromEntries(
      Object.entries(c.expect.statuses).map(([id, s]) => [id, s === 'either' ? 'partial' : s]),
    ),
    chosenBy: 'model',
  }),

  constant: {
    name: 'always "nothing covered"',
    observe: (_c, ctx) => {
      const items = coverageItems(ctx.notes);
      return {
        target: items[0].id,
        statuses: Object.fromEntries(items.map((i) => [i.id, 'not_covered' as const])),
        chosenBy: 'order',
      };
    },
  },
};
