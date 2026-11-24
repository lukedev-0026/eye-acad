import { AppError } from './app.error';
import type { AppErrorOptions } from './app.error';

// No sign-in token, or one that did not verify. The two are not told apart to
// the caller: either way, the answer is to sign in.
export class UnauthenticatedError extends AppError {
  override readonly name = 'UnauthenticatedError';
  readonly code = 'UNAUTHENTICATED';
  readonly status = 401;
  override readonly expose = true;

  constructor(options: AppErrorOptions = {}) {
    super('Please sign in.', options);
  }
}
