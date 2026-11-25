import { z } from 'zod';

import { runSelector } from '@/application/steps/selector.step';
import { historyLabel } from '@/domain/examiner/render';
import { REQUEST_EYES } from '@/domain/examiner/selector.schema';
import { readCases } from '@/eval/eval-context';
import type { EvalCase, StepEval } from '@/eval/eval.types';

import { asRun } from './as-run';

export const SelectorInputSchema = z.object({
  utterance: z.string(),
  // What the trainee asked for on the turn before, for a request like "and the left?".
  previous: z.array(z.object({ item: z.string(), eye: z.enum(REQUEST_EYES) })).optional(),
});
export const SelectorExpectSchema = z.object({
  kind: z.string(),
  ids: z.array(z.string()).optional(),
  acceptKinds: z.array(z.string()).optional(),
  alsoNotRecorded: z.boolean().optional(),
});
type Input = z.infer<typeof SelectorInputSchema>;
type Expect = z.infer<typeof SelectorExpectSchema>;
interface Observed {
  kind: string;
  ids: Array<string>;
  alsoNotRecorded: boolean;
}

const EYE_WORDS = { right: 'in the right eye', left: 'in the left eye' } as const;

export const selectorEval: StepEval<Input, Expect, Observed> = {
  step: 'selector',

  async cases(ctx) {
    // One plainly worded request for every row and every history field,
    // generated from the live case file. These check the wiring; the
    // hand-written cases check understanding.
    const canonical: Array<EvalCase<Input, Expect>> = [
      ...ctx.publicCase.findings.map((f) => ({
        id: `sel-row-${f.id}`,
        split: 'tune' as const,
        type: 'canonical',
        input: {
          utterance: `What is the ${f.label.toLowerCase()}${f.eye === 'right' || f.eye === 'left' ? ` ${EYE_WORDS[f.eye]}` : ''}?`,
          previous: [],
        },
        expect: { kind: 'reveal', ids: [f.id] },
      })),
      ...Object.keys(ctx.publicCase.patient).map((key) => ({
        id: `sel-history-${key}`,
        split: 'tune' as const,
        type: 'canonical',
        input: { utterance: `What is the patient's ${historyLabel(key).toLowerCase()}?`, previous: [] },
        expect: { kind: 'reveal', ids: [`history:${key}`] },
      })),
    ];
    return [...canonical, ...(await readCases('selector.jsonl', SelectorInputSchema, SelectorExpectSchema))];
  },

  async run(c, settings, ctx) {
    const run = await runSelector(ctx.models, ctx.publicCase, c.input.utterance, c.input.previous ?? [], settings);
    const d = run.decision;
    const recorded = asRun(run.call, {
      kind: d ? d.kind : 'error',
      ids: d?.kind === 'reveal' ? d.items.map((i) => i.id) : [],
      alsoNotRecorded: d?.kind === 'reveal' ? d.alsoNotRecorded : false,
    });
    if (!run.check) return recorded;
    // The second look is part of the turn: its time counts, and its reply is
    // kept beside the first.
    return {
      ...recorded,
      calls: 2,
      ms: recorded.ms + run.check.ms,
      modelMs: recorded.modelMs + (run.check.server.evalMs ?? 0),
      promptTokens: recorded.promptTokens + (run.check.server.promptTokens ?? 0),
      outputTokens: recorded.outputTokens + (run.check.server.outputTokens ?? 0),
      raw: `${recorded.raw}\n--- check ---\n${run.check.rawText}`,
    };
  },

  grade(c, observed) {
    const wanted = new Set(c.expect.kind === 'reveal' ? (c.expect.ids ?? []) : []);
    const extra = observed.ids.filter((id) => !wanted.has(id));
    const missing = [...wanted].filter((id) => !observed.ids.includes(id));
    const kindOk = [c.expect.kind, ...(c.expect.acceptKinds ?? [])].includes(observed.kind);
    const flagOk = !c.expect.alsoNotRecorded || observed.alsoNotRecorded;
    const pass = kindOk && extra.length === 0 && missing.length === 0 && flagOk;
    return {
      pass,
      // Showing a row that was not asked for, or the other eye.
      costly: extra.length > 0,
      fallback: false,
      detail: pass
        ? `${observed.kind}${observed.ids.length ? `: ${observed.ids.join(', ')}` : ''}`
        : `got ${observed.kind} [${observed.ids.join(', ')}]; wanted ${c.expect.kind} [${[...wanted].join(', ')}]` +
          (extra.length ? `; revealed without being asked: ${extra.join(', ')}` : '') +
          (missing.length ? `; not revealed: ${missing.join(', ')}` : '') +
          (flagOk ? '' : '; did not say something was not recorded'),
    };
  },

  ideal: (c) => ({
    kind: c.expect.kind,
    ids: c.expect.kind === 'reveal' ? (c.expect.ids ?? []) : [],
    alsoNotRecorded: c.expect.alsoNotRecorded ?? false,
  }),

  constant: {
    name: 'never reveal anything',
    observe: () => ({ kind: 'not_recorded', ids: [], alsoNotRecorded: false }),
  },
};
