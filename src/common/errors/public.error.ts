import type { AppError } from './app.error';
import type { ErrorCode } from './error-codes';

export interface PublicErrorFields {
  readonly code: ErrorCode;
  // Always safe to show: either a message written for the trainee, or the
  // generic one.
  readonly message: string;
  // True when the message says what actually happened, so it is worth showing
  // in place of the screen's own wording.
  readonly specific: boolean;
  readonly status: number;
  // Quote this when asking what happened: the server's log has the rest.
  readonly requestId: string;
}

// The only error the browser ever receives from the server. It never carries a
// cause, details or a stack: what really went wrong stays in the server's log.
export class PublicError extends Error {
  override readonly name = 'PublicError';
  readonly code: ErrorCode;
  readonly specific: boolean;
  readonly status: number;
  readonly requestId: string;

  constructor(fields: PublicErrorFields) {
    super(fields.message);
    this.code = fields.code;
    this.specific = fields.specific;
    this.status = fields.status;
    this.requestId = fields.requestId;
  }

  toFields(): PublicErrorFields {
    return {
      code: this.code,
      message: this.message,
      specific: this.specific,
      status: this.status,
      requestId: this.requestId,
    };
  }
}

export const GENERIC_PUBLIC_MESSAGE = 'Something went wrong. Please try again.';

// What the browser is told about an error. Its message goes only if it was
// written to be shown; otherwise the browser gets the generic one.
export function toPublicError(error: AppError, requestId: string): PublicError {
  return new PublicError({
    code: error.code,
    message: error.expose ? error.message : GENERIC_PUBLIC_MESSAGE,
    specific: error.expose,
    status: error.status,
    requestId,
  });
}
