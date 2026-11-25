import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';
import type { CallOutcome } from '@/domain/llm/call-result';

/** A revision step could not run; the attempt stays put and can be retried.
 *  Never shown to the trainee as "no support". */
export class RevisionUnavailableError extends AppError {
  override readonly name = 'RevisionUnavailableError';
  readonly code = 'REVISION_UNAVAILABLE';
  readonly status = 503;
  readonly step: string;
  readonly outcome: CallOutcome;

  constructor(
    step: string,
    outcome: CallOutcome,
    detail: string | undefined,
    options: AppErrorOptions = {},
  ) {
    super(`${step}: ${outcome} ${detail ?? ''}`.trim(), {
      ...options,
      details: { step, outcome, ...options.details },
    });
    this.step = step;
    this.outcome = outcome;
  }
}
