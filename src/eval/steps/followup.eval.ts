import { z } from 'zod';

import { runFollowUp } from '@/application/steps/followup.step';
import { readCases } from '@/eval/eval-context';
import type { StepEval } from '@/eval/eval.types';

export const FollowUpInputSchema = z.object({ answer: z.string() });
export const FollowUpExpectSchema = z.object({});
type Input = z.infer<typeof FollowUpInputSchema>;
type Expect = z.infer<typeof FollowUpExpectSchema>;
interface Observed {
  path: 'written' | 'supplied' | 'fixed';
  question: string;
  respondingTo: string | null;
  firstAttemptOk: boolean;
  reasons: Array<string>;
}

export const followupEval: StepEval<Input, Expect, Observed> = {
  step: 'followup',
  cases: () =>
    readCases('followup.jsonl', FollowUpInputSchema, FollowUpExpectSchema),

  async run(c, settings, ctx) {
    const result = await runFollowUp(
      ctx.models,
      ctx.notes,
      c.input.answer,
      settings,
    );
    const calls = result.attempts.map((a) => a.call);
    const last = calls.at(-1);
    const first = result.attempts[0];
    return {
      outcome: calls.some((x) => x.outcome === 'ok')
        ? 'ok'
        : (last?.outcome ?? 'ok'),
      observed: {
        path: result.path,
        question: result.question,
        respondingTo: result.respondingTo,
        firstAttemptOk: Boolean(
          first?.questionCheck?.ok && first.anchorCheck?.ok,
        ),
        reasons: result.attempts.flatMap((a) => [
          ...(a.questionCheck && !a.questionCheck.ok
            ? [`question ${a.questionCheck.reason}`]
            : []),
          ...(a.anchorCheck && !a.anchorCheck.ok ? [a.anchorCheck.reason] : []),
        ]),
      },
      calls: calls.length,
      ms: calls.reduce((n, x) => n + x.ms, 0),
      modelMs: calls.reduce((n, x) => n + (x.server.evalMs ?? 0), 0),
      promptTokens: calls.reduce((n, x) => n + (x.server.promptTokens ?? 0), 0),
      outputTokens: calls.reduce((n, x) => n + (x.server.outputTokens ?? 0), 0),
      thinkingChars: calls.reduce((n, x) => n + x.thinkingChars, 0),
      model: last?.model ?? settings.model,
      raw: calls.map((x) => x.rawText).join('\n---\n'),
    };
  },

  grade(_c, observed) {
    const written = observed.path === 'written';
    return {
      pass: written,
      costly: false,
      fallback: !written,
      detail: written
        ? `"${observed.question}"`
        : `fell back to a supplied question (${observed.reasons.join('; ') || 'no usable reply'})`,
    };
  },

  ideal: () => ({
    path: 'written',
    question: '',
    respondingTo: null,
    firstAttemptOk: true,
    reasons: [],
  }),
  constant: {
    name: 'always use a supplied question',
    observe: () => ({
      path: 'supplied',
      question: '',
      respondingTo: null,
      firstAttemptOk: false,
      reasons: [],
    }),
  },
};
