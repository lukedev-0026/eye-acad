import { AppError } from './app.error';
import type { AppErrorOptions } from './app.error';

// Something failed that nobody planned for. The trainee is told only that
// something went wrong; the cause is in the log.
export class InternalError extends AppError {
  override readonly name = 'InternalError';
  readonly code = 'INTERNAL';
  readonly status = 500;

  constructor(options: AppErrorOptions = {}, message = 'An unexpected error occurred.') {
    super(message, options);
  }
}
