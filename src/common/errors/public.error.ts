import type { AppError } from './app.error';
import type { ErrorCode } from './error-codes';

export interface PublicErrorFields {
  readonly code: ErrorCode;
  readonly message: string;
  readonly specific: boolean;
  readonly status: number;
  readonly requestId: string;
}

/** The only error the browser receives: never a cause, details or stack. */
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

export function toPublicError(error: AppError, requestId: string): PublicError {
  return new PublicError({
    code: error.code,
    message: error.expose ? error.message : GENERIC_PUBLIC_MESSAGE,
    specific: error.expose,
    status: error.status,
    requestId,
  });
}
