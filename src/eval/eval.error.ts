import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

// Things that stop the measurement harness. None of them ever reaches a
// browser; the command-line tools print the message and stop.
export abstract class EvalError extends AppError {
  readonly status = 500;
}

// A case file names something that is not there: a target, a sentence, a finding.
export class InvalidEvalCaseError extends EvalError {
  override readonly name = 'InvalidEvalCaseError';
  readonly code = 'EVAL_INVALID_CASE';

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}

// The run was asked for something it will not do: the held-back cases before
// a decision is recorded, a report with no results.
export class EvalRefusedError extends EvalError {
  override readonly name = 'EvalRefusedError';
  readonly code = 'EVAL_REFUSED';

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}

export class TooManyInfraErrorsError extends EvalError {
  override readonly name = 'TooManyInfraErrorsError';
  readonly code = 'EVAL_TOO_MANY_INFRA_ERRORS';

  constructor(options: AppErrorOptions = {}) {
    super('Five calls in a row could not reach the model.', options);
  }
}

// The sweep stops cleanly between configurations: finished work is kept, and
// a restart carries on from where it stopped.
export class OutOfTimeError extends EvalError {
  override readonly name = 'OutOfTimeError';
  readonly code = 'EVAL_OUT_OF_TIME';

  constructor(options: AppErrorOptions = {}) {
    super('The time budget for this run has been used.', options);
  }
}

export class LowBatteryError extends EvalError {
  override readonly name = 'LowBatteryError';
  readonly code = 'EVAL_LOW_BATTERY';

  constructor(percent: number, minimum: number, options: AppErrorOptions = {}) {
    super(`The battery is at ${percent}%, under the ${minimum}% this run was told to stop at.`, {
      ...options,
      details: { percent, minimum, ...options.details },
    });
  }
}
