import type { ErrorCode } from './error-codes';

export interface PublicErrorFields {
  readonly code: ErrorCode;
  readonly message: string;
  readonly status: number;
  readonly requestId: string;
}

// The only error the browser ever receives from the server. It carries a code
// to switch on, a message that is safe to show, and the request id to quote
// when asking what happened. It never carries a cause: what really went wrong
// stays in the server's log.
export class PublicError extends Error {
  override readonly name = 'PublicError';
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;

  constructor(fields: PublicErrorFields) {
    super(fields.message);
    this.code = fields.code;
    this.status = fields.status;
    this.requestId = fields.requestId;
  }

  toFields(): PublicErrorFields {
    return { code: this.code, message: this.message, status: this.status, requestId: this.requestId };
  }
}

export const GENERIC_PUBLIC_MESSAGE = 'Something went wrong. Please try again.';
