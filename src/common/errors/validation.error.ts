import { AppError } from './app.error';
import type { AppErrorOptions } from './app.error';

export class ValidationError extends AppError {
  override readonly name = 'ValidationError';
  readonly code = 'INVALID_INPUT';
  readonly status = 400;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}
