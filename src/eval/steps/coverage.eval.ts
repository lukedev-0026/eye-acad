import { z } from 'zod';

import { STATUSES, coverageItems, runCoverage } from '@/application/steps/coverage.step';
import type { Status } from '@/application/steps/coverage.step';
import { readCases } from '@/eval/eval-context';
import type { StepEval } from '@/eval/eval.types';

import { asRun } from './as-run';

export const CoverageInputSchema = z.object({ answer: z.string() });
export const CoverageExpectSchema = z.object({
  // Any of these is a defensible gap to show the trainee.
  acceptableTargets: z.array(z.string()).min(1),
  // "either" marks a point the sample answer half-covers: it is left out of the count.
  statuses: z.record(z.string(), z.enum([...STATUSES, 'either'])),
});
type Input = z.infer<typeof CoverageInputSchema>;
type Expect = z.infer<typeof CoverageExpectSchema>;
type Observed = { target: string; statuses: Record<string, Status>; chosenBy: string | null };

export const coverageEval: StepEval<Input, Expect, Observed> = {
  step: 'coverage',
  cases: () => readCases('coverage.jsonl', CoverageInputSchema, CoverageExpectSchema),

  async run(c, settings, ctx) {
    const result = await runCoverage(ctx.models, ctx.notes, c.input.answer, settings);
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
