import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

// The case file is missing, is not JSON, or does not have the expected shape.
// The message names the file and the problem, for whoever edited it; the
// trainee is told only that something went wrong.
export class CaseFileError extends AppError {
  override readonly name = 'CaseFileError';
  readonly code = 'CASE_FILE_INVALID';
  readonly status = 500;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}
