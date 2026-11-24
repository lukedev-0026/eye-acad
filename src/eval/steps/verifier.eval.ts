import { runVerifier } from '@/application/steps/verifier.step';
import { findSentence, readCases } from '@/eval/eval-context';
import type { StepEval } from '@/eval/eval.types';

import { asRun } from './selector.eval';

type Input = { statement: string; cite: string };
type Expect = { verdict: 'supported' | 'not_supported' };
type Observed = { supported: boolean; reason: string };

export const verifierEval: StepEval<Input, Expect, Observed> = {
  step: 'verifier',
  cases: () => readCases<Input, Expect>('verifier.jsonl'),

  async run(c, settings, ctx) {
    const { chunk, sentence } = findSentence(ctx.index, c.input.cite);
    const result = await runVerifier(ctx.models, c.input.statement, chunk, [sentence.id], settings);
    return asRun(result.call, { supported: result.supported, reason: result.call.value?.reason ?? '' });
  },

  grade(c, observed) {
    const shouldSupport = c.expect.verdict === 'supported';
    return {
      pass: observed.supported === shouldSupport,
      // A false accept: the trainee is shown a quotation that does not back
      // the advice. A false reject only costs a "no support" message.
      costly: observed.supported && !shouldSupport,
      fallback: false,
      detail: `${observed.supported ? 'supported' : 'not supported'}${observed.reason ? ` — ${observed.reason}` : ''}`,
    };
  },

  ideal: (c) => ({ supported: c.expect.verdict === 'supported', reason: '' }),
  constant: { name: 'always "not supported"', observe: () => ({ supported: false, reason: '' }) },
};
