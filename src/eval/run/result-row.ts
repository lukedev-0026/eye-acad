import type { CallOutcome } from '@/domain/llm/call-result';
import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import type { Graded, Split } from '@/eval/eval.types';

// One model call, as it is saved: what was asked, with which settings, what
// came back, and how it was graded.
export type ResultRow = {
  type: 'result';
  runId: string;
  stage: string;
  at: string;
  step: StepId;
  configId: string;
  settings: StepSettings;
  split: Split;
  caseId: string;
  caseType: string;
  trial: number;
  seed: number | null;
  outcome: CallOutcome;
  pass: boolean;
  costly: boolean;
  fallback: boolean;
  detail: string;
  secondary?: Graded['secondary'];
  ms: number;
  modelMs: number;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingChars: number;
  model: string;
  observed: unknown;
  raw: string;
};

// What makes a saved row the same piece of work as one about to be run.
export const rowKey = (stage: string, cfg: string, caseId: string, trial: number) =>
  `${stage}|${cfg}|${caseId}|${trial}`;
