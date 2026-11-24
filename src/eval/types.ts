import type { ExaminerNotes, PublicCase } from '../server/case-schema';
import type { Catalogue } from '../server/catalogue';
import type { CallOutcome, StepId, StepSettings } from '../server/llm/types';
import type { NoteIndex } from '../server/note-types';

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

export type RetrievalTarget = {
  id: string;
  source: string;
  gold: Array<string>;
  alsoSupports: Array<string>;
  offSection?: Array<string>;
  distractor: Array<string>;
};

export type EvalContext = {
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
