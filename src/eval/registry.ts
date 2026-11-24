import type { StepId } from '../server/llm/types'
import { coverageEval } from './coverage'
import { followupEval } from './followup'
import { revisionEval } from './revision'
import { selectorEval } from './selector'
import type { AnyStepEval } from './types'
import { verifierEval } from './verifier'

export const STEP_EVALS: Record<StepId, AnyStepEval> = {
  selector: selectorEval,
  followup: followupEval,
  coverage: coverageEval,
  revision: revisionEval,
  verifier: verifierEval,
}
