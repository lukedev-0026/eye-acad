import type { z } from 'zod';

import type { ExaminerNotes, PublicCase } from '@/domain/case/case.schema';
import type { Catalogue } from '@/domain/examiner/catalogue';
import type { CallOutcome } from '@/domain/llm/call-result';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import type { NoteIndex } from '@/domain/note/note.schema';

import type { RetrievalTargetSchema } from './eval-case.schema';

// The checks call the app's own step functions. Nothing here re-implements a
// prompt or a model call: a copy would measure a different system.

export type Split = 'tune' | 'holdout';

export type EvalCase<I = unknown, E = unknown> = {
  id: string;
  // tune: used to choose settings and the improvement.
  // holdout: only ever used to report.
  split: Split;
  type: string;
  input: I;
  expect: E;
  note?: string;
};

export type RetrievalTarget = z.infer<typeof RetrievalTargetSchema>;

export type EvalContext = {
  // The model gateway the steps are called with: the app's own.
  models: LanguageModelGateway;
  publicCase: PublicCase;
  catalogue: Catalogue;
  notes: ExaminerNotes;
  guidance: string | null;
  index: NoteIndex;
  targets: Array<RetrievalTarget>;
  // Query embeddings, kept so that every configuration searches identically.
  vectors: Map<string, Array<number> | null>;
};

export type Graded = {
  pass: boolean;
  // The expensive kind of mistake for this step, counted separately.
  costly: boolean;
  // A safe pre-written fallback was used in place of the model's own text.
  fallback: boolean;
  detail: string;
  // A second, finer count where a step has one (item agreement for coverage).
  secondary?: { k: number; n: number; leftOut: number };
};

export type StepRun<O> = {
  outcome: CallOutcome;
  observed: O;
  calls: number;
  // Wall-clock for the whole step, retries included.
  ms: number;
  modelMs: number;
  promptTokens: number;
  outputTokens: number;
  thinkingChars: number;
  model: string;
  raw: string;
};

export type StepEval<I, E, O> = {
  step: StepId;
  cases: (ctx: EvalContext) => Promise<Array<EvalCase<I, E>>>;
  run: (c: EvalCase<I, E>, settings: StepSettings, ctx: EvalContext) => Promise<StepRun<O>>;
  grade: (c: EvalCase<I, E>, observed: O, ctx: EvalContext) => Graded;
  // A perfect observation for the case. Fed through `grade` before any model
  // runs, to prove the grader agrees with its own expected answers.
  ideal: (c: EvalCase<I, E>, ctx: EvalContext) => O;
  // What a step that ignores its input would produce: the floor.
  constant: { name: string; observe: (c: EvalCase<I, E>, ctx: EvalContext) => O };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStepEval = StepEval<any, any, any>;
