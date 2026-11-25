import { AppError } from './app.error';
import type { AppErrorOptions } from './app.error';

/** Missing or invalid token: deliberately not told apart. */
export class UnauthenticatedError extends AppError {
  override readonly name = 'UnauthenticatedError';
  readonly code = 'UNAUTHENTICATED';
  readonly status = 401;
  override readonly expose = true;

  constructor(options: AppErrorOptions = {}) {
    super('Please sign in.', options);
  }
}
