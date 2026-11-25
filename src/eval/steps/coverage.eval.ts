import { z } from 'zod';

import {
  STATUSES,
  coverageItems,
  runCoverage,
} from '@/application/steps/coverage.step';
import type { Status } from '@/application/steps/coverage.step';
import { itemAt } from '@/common/arrays';
import { readCases } from '@/eval/eval-context';
import type { StepEval } from '@/eval/eval.types';

import { asRun } from './as-run';

export const CoverageInputSchema = z.object({ answer: z.string() });
export const CoverageExpectSchema = z.object({
  acceptableTargets: z.array(z.string()).min(1),
  statuses: z.record(z.string(), z.enum([...STATUSES, 'either'])),
});
type Input = z.infer<typeof CoverageInputSchema>;
type Expect = z.infer<typeof CoverageExpectSchema>;
interface Observed {
  target: string;
  statuses: Record<string, Status>;
  chosenBy: string | null;
}

export const coverageEval: StepEval<Input, Expect, Observed> = {
  step: 'coverage',
  cases: () =>
    readCases('coverage.jsonl', CoverageInputSchema, CoverageExpectSchema),

  async run(c, settings, ctx) {
    const result = await runCoverage(
      ctx.models,
      ctx.notes,
      c.input.answer,
      settings,
    );
    return asRun(result.call, {
      target:
        result.call.outcome !== 'ok' ? 'error' : (result.target?.id ?? 'none'),
      statuses: Object.fromEntries(result.items.map((i) => [i.id, i.status])),
      chosenBy: result.targetChosenBy,
    });
  },

  grade(c, observed) {
    const ids = Object.keys(c.expect.statuses);
    const counted = ids.filter((id) => c.expect.statuses[id] !== 'either');
    const agree = counted.filter(
      (id) => observed.statuses[id] === c.expect.statuses[id],
    );
    const hidden = ids.filter(
      (id) =>
        c.expect.statuses[id] === 'not_covered' &&
        observed.statuses[id] === 'covered',
    );
    const pass = c.expect.acceptableTargets.includes(observed.target);
    return {
      pass,
      costly: hidden.length > 0,
      fallback: false,
      secondary: {
        k: agree.length,
        n: counted.length,
        leftOut: ids.length - counted.length,
      },
      detail:
        `target ${observed.target}${pass ? '' : ` (acceptable: ${c.expect.acceptableTargets.join(', ')})`}; ` +
        `items agreed ${agree.length} of ${counted.length}` +
        (hidden.length
          ? `; missed but marked covered: ${hidden.join(', ')}`
          : ''),
    };
  },

  ideal: (c) => ({
    target: itemAt(c.expect.acceptableTargets, 0),
    statuses: Object.fromEntries(
      Object.entries(c.expect.statuses).map(([id, s]) => [
        id,
        s === 'either' ? 'partial' : s,
      ]),
    ),
    chosenBy: 'model',
  }),

  constant: {
    name: 'always "nothing covered"',
    observe: (_c, ctx) => {
      const items = coverageItems(ctx.notes);
      return {
        target: itemAt(items, 0).id,
        statuses: Object.fromEntries(
          items.map((i) => [i.id, 'not_covered' as const]),
        ),
        chosenBy: 'order',
      };
    },
  },
};
