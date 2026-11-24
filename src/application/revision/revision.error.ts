import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';
import type { CallOutcome } from '@/domain/llm/call-result';

// A step of the revision pipeline could not run at all: the model was
// unreachable, or its reply was unusable. The attempt stays where it is and the
// trainee can try again. They are never told "no support" for what was really
// a technical failure.
export class RevisionUnavailableError extends AppError {
  override readonly name = 'RevisionUnavailableError';
  readonly code = 'REVISION_UNAVAILABLE';
  readonly status = 503;

  constructor(step: string, outcome: CallOutcome, detail: string | undefined, options: AppErrorOptions = {}) {
    super(`${step}: ${outcome} ${detail ?? ''}`.trim(), { ...options, details: { step, outcome, ...options.details } });
  }
}
