import { runSelector } from '@/application/steps/selector.step';
import { historyLabel } from '@/domain/examiner/render';
import type { SelectorRequest } from '@/domain/examiner/selector.schema';
import type { CallResult } from '@/domain/llm/call-result';
import { readCases } from '@/eval/eval-context';
import type { EvalCase, StepEval, StepRun } from '@/eval/eval.types';

type Input = { utterance: string; previous?: Array<SelectorRequest> };
type Expect = { kind: string; ids?: Array<string>; acceptKinds?: Array<string>; alsoNotRecorded?: boolean };
type Observed = { kind: string; ids: Array<string>; alsoNotRecorded: boolean };

export function asRun<O>(call: CallResult<unknown>, observed: O): StepRun<O> {
  return {
    outcome: call.outcome,
    observed,
    calls: 1,
    ms: call.ms,
    modelMs: call.server.evalMs ?? 0,
    promptTokens: call.server.promptTokens ?? 0,
    outputTokens: call.server.outputTokens ?? 0,
    thinkingChars: call.thinkingChars,
    model: call.model,
    raw: call.rawText,
  };
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
    return [...canonical, ...(await readCases<Input, Expect>('selector.jsonl'))];
  },

  async run(c, settings, ctx) {
    const run = await runSelector(ctx.models, ctx.publicCase, c.input.utterance, c.input.previous ?? [], settings);
    const d = run.decision;
    return asRun(run.call, {
      kind: d ? d.kind : 'error',
      ids: d?.kind === 'reveal' ? d.items.map((i) => i.id) : [],
      alsoNotRecorded: d?.kind === 'reveal' ? d.alsoNotRecorded : false,
    });
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
