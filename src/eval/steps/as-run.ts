import type { CallResult } from '@/domain/llm/call-result';
import type { StepRun } from '@/eval/eval.types';

// One model call, with what the check made of it, in the shape every step's
// run is recorded in.
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
