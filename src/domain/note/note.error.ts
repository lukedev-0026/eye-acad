import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

export abstract class NoteIndexError extends AppError {
  readonly status = 503;
  override readonly expose = true;
}

export class NoteIndexMissingError extends NoteIndexError {
  override readonly name = 'NoteIndexMissingError';
  readonly code = 'NOTE_INDEX_MISSING';

  constructor(options: AppErrorOptions = {}) {
    super(
      'The reference note has not been prepared. Run: pnpm ingest',
      options,
    );
  }
}

export class NoteIndexStaleError extends NoteIndexError {
  override readonly name = 'NoteIndexStaleError';
  readonly code = 'NOTE_INDEX_STALE';

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}

export class NotePreparationError extends NoteIndexError {
  override readonly name = 'NotePreparationError';
  readonly code = 'NOTE_PREPARATION_FAILED';

  constructor(problems: ReadonlyArray<string>, options: AppErrorOptions = {}) {
    super(`The note did not parse cleanly:\n- ${problems.join('\n- ')}`, {
      ...options,
      details: { problems, ...options.details },
    });
  }
}
