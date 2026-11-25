import { AttemptNotFoundError } from '@/domain/attempt/attempt.error';
import type {
  AttemptRepository,
  WorkingNote,
} from '@/domain/attempt/attempt.repository';
import { PublicAttemptSchema } from '@/domain/attempt/attempt.schema';
import type { PublicAttempt } from '@/domain/attempt/attempt.schema';

/**
 * In-memory store with the real one's rules: schema-checked,
 * all-or-nothing updates, owner-only access.
 */
export class InMemoryAttemptRepository implements AttemptRepository {
  private readonly attempts = new Map<string, PublicAttempt>();
  private readonly notes = new Map<string, Array<WorkingNote>>();
  private nextId = 1;

  count(uid: string): Promise<number> {
    return Promise.resolve(
      [...this.attempts.keys()].filter((key) => key.startsWith(`${uid}/`))
        .length,
    );
  }

  create(uid: string, attempt: PublicAttempt): Promise<string> {
    const id = `attempt-${this.nextId++}`;
    this.attempts.set(
      `${uid}/${id}`,
      PublicAttemptSchema.parse(structuredClone(attempt)),
    );
    return Promise.resolve(id);
  }

  read(uid: string, attemptId: string): Promise<PublicAttempt> {
    const found = this.attempts.get(`${uid}/${attemptId}`);
    return found
      ? Promise.resolve(structuredClone(found))
      : Promise.reject(new AttemptNotFoundError());
  }

  async update<T>(
    uid: string,
    attemptId: string,
    change: (attempt: PublicAttempt) => T,
  ): Promise<T> {
    const attempt = await this.read(uid, attemptId);
    const result = change(attempt);
    attempt.updatedAtMs = Date.now();
    this.attempts.set(
      `${uid}/${attemptId}`,
      PublicAttemptSchema.parse(attempt),
    );
    return result;
  }

  appendWorkingNote(
    uid: string,
    attemptId: string,
    note: WorkingNote,
  ): Promise<void> {
    const key = `${uid}/${attemptId}`;
    this.notes.set(key, [...(this.notes.get(key) ?? []), note]);
    return Promise.resolve();
  }

  workingNotes(uid: string, attemptId: string): Array<WorkingNote> {
    return this.notes.get(`${uid}/${attemptId}`) ?? [];
  }
}
