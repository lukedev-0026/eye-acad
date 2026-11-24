import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

// The prepared copy of the reference note cannot be used. Quoting old text
// against a new document would be worse than stopping, so the revision point
// stops, and says what to do.
export abstract class NoteIndexError extends AppError {
  readonly status = 503;
  override readonly expose = true;
}

export class NoteIndexMissingError extends NoteIndexError {
  override readonly name = 'NoteIndexMissingError';
  readonly code = 'NOTE_INDEX_MISSING';

  constructor(options: AppErrorOptions = {}) {
    super('The reference note has not been prepared. Run: pnpm ingest', options);
  }
}

// The PDF, or the embeddings model, has changed since the note was prepared.
export class NoteIndexStaleError extends NoteIndexError {
  override readonly name = 'NoteIndexStaleError';
  readonly code = 'NOTE_INDEX_STALE';

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}
