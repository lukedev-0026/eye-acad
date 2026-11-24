import type { PublicAttempt } from './attempt.schema';

// One entry in an attempt's server-only working notes: what a step was given,
// what it returned and how long it took. Never sent to the browser.
export type WorkingNote = Readonly<Record<string, unknown>> & { readonly step: string };

// Where attempts are kept. Every method takes the owner's uid: an attempt is
// only ever reached through its owner, so one trainee cannot act on another's.
export interface AttemptRepository {
  count(uid: string): Promise<number>;

  // Returns the new attempt's id.
  create(uid: string, attempt: PublicAttempt): Promise<string>;

  // Throws AttemptNotFoundError if the owner has no such attempt.
  read(uid: string, attemptId: string): Promise<PublicAttempt>;

  // Reads the attempt, lets `change` edit it, and saves it, as one step: two
  // requests cannot interleave. If `change` throws, nothing is saved and the
  // error is passed on. Returns whatever `change` returns.
  update<T>(uid: string, attemptId: string, change: (attempt: PublicAttempt) => T): Promise<T>;

  appendWorkingNote(uid: string, attemptId: string, note: WorkingNote): Promise<void>;
}
