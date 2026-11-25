import type { PublicAttempt } from './attempt.schema';

export type WorkingNote = Readonly<Record<string, unknown>> & {
  readonly step: string;
};

/**
 * Every method takes the owner's uid, so no trainee reaches another's attempt.
 * `update` is atomic; if `change` throws, nothing is saved.
 */
export interface AttemptRepository {
  count(uid: string): Promise<number>;

  create(uid: string, attempt: PublicAttempt): Promise<string>;

  read(uid: string, attemptId: string): Promise<PublicAttempt>;

  update<T>(
    uid: string,
    attemptId: string,
    change: (attempt: PublicAttempt) => T,
  ): Promise<T>;

  appendWorkingNote(
    uid: string,
    attemptId: string,
    note: WorkingNote,
  ): Promise<void>;
}
