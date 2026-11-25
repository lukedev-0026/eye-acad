import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

export class CaseFileError extends AppError {
  override readonly name = 'CaseFileError';
  readonly code = 'CASE_FILE_INVALID';
  readonly status = 500;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}
