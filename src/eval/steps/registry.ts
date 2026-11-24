import type { StepId } from '@/domain/llm/step-settings.schema';
import type { AnyStepEval } from '@/eval/eval.types';

import { coverageEval } from './coverage.eval';
import { followupEval } from './followup.eval';
import { revisionEval } from './revision.eval';
import { selectorEval } from './selector.eval';
import { verifierEval } from './verifier.eval';

export const STEP_EVALS: Record<StepId, AnyStepEval> = {
  selector: selectorEval,
  followup: followupEval,
  coverage: coverageEval,
  revision: revisionEval,
  verifier: verifierEval,
};
