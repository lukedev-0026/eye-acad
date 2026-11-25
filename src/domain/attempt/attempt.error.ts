import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

export abstract class AttemptError extends AppError {
  override readonly expose = true;
}

/** Missing or someone else's: deliberately not told apart. */
export class AttemptNotFoundError extends AttemptError {
  override readonly name = 'AttemptNotFoundError';
  readonly code = 'ATTEMPT_NOT_FOUND';
  readonly status = 404;

  constructor(options: AppErrorOptions = {}) {
    super('Attempt not found.', options);
  }
}

export class AttemptPhaseError extends AttemptError {
  override readonly name = 'AttemptPhaseError';
  readonly code = 'ATTEMPT_WRONG_PHASE';
  readonly status = 409;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}

export class AttemptLimitReachedError extends AttemptError {
  override readonly name = 'AttemptLimitReachedError';
  readonly code = 'ATTEMPT_LIMIT_REACHED';
  readonly status = 429;

  constructor(options: AppErrorOptions = {}) {
    super('This account has reached its limit of attempts.', options);
  }
}

export class EmptyAnswerError extends AttemptError {
  override readonly name = 'EmptyAnswerError';
  readonly code = 'ANSWER_EMPTY';
  readonly status = 400;

  constructor(options: AppErrorOptions = {}) {
    super('Please give your diagnosis and management first.', options);
  }
}
