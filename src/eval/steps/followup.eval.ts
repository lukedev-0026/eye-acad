import { runFollowUp } from '@/application/steps/followup.step';
import { readCases } from '@/eval/eval-context';
import type { StepEval } from '@/eval/eval.types';

type Input = { answer: string };
type Observed = {
  path: 'written' | 'supplied' | 'fixed';
  question: string;
  respondingTo: string | null;
  firstAttemptOk: boolean;
  reasons: Array<string>;
};

export const followupEval: StepEval<Input, Record<string, never>, Observed> = {
  step: 'followup',
  cases: () => readCases<Input, Record<string, never>>('followup.jsonl'),

  async run(c, settings, ctx) {
    const result = await runFollowUp(ctx.notes, c.input.answer, settings);
    const calls = result.attempts.map((a) => a.call);
    const last = calls.at(-1);
    return {
      // A step that fell back to a supplied question still completed.
      outcome: calls.some((x) => x.outcome === 'ok') ? 'ok' : (last?.outcome ?? 'ok'),
      observed: {
        path: result.path,
        question: result.question,
        respondingTo: result.respondingTo,
        firstAttemptOk: Boolean(result.attempts[0]?.questionCheck?.ok && result.attempts[0]?.anchorCheck?.ok),
        reasons: result.attempts.flatMap((a) => [
          ...(a.questionCheck && !a.questionCheck.ok ? [`question ${a.questionCheck.reason}`] : []),
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

  // The automatic pass means a model-written question survived every check
  // within the app's two attempts. Whether it is a GOOD question is read by a
  // person, for the finalist settings only.
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

  ideal: () => ({ path: 'written', question: '', respondingTo: null, firstAttemptOk: true, reasons: [] }),
  constant: {
    name: 'always use a supplied question',
    observe: () => ({ path: 'supplied', question: '', respondingTo: null, firstAttemptOk: false, reasons: [] }),
  },
};
