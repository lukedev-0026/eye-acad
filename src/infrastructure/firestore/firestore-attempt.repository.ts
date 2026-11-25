import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

import { AppError } from '@/common/errors/app.error';
import { AttemptStoreError } from '@/common/errors/external-service.error';
import { AttemptNotFoundError } from '@/domain/attempt/attempt.error';
import type {
  AttemptRepository,
  WorkingNote,
} from '@/domain/attempt/attempt.repository';
import { PublicAttemptSchema } from '@/domain/attempt/attempt.schema';
import type { PublicAttempt } from '@/domain/attempt/attempt.schema';

/** Every read and write passes through PublicAttemptSchema, so only
 *  browser-safe fields are ever stored or returned. */
export class FirestoreAttemptRepository implements AttemptRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async count(uid: string): Promise<number> {
    return this.guard(
      'count',
      async () => (await this.attemptsOf(uid).count().get()).data().count,
    );
  }

  async create(uid: string, attempt: PublicAttempt): Promise<string> {
    return this.guard('create', async () => {
      const ref = this.attemptsOf(uid).doc();
      await ref.set(PublicAttemptSchema.parse(attempt));
      return ref.id;
    });
  }

  async read(uid: string, attemptId: string): Promise<PublicAttempt> {
    return this.guard('read', async () => {
      const snap = await this.attemptRef(uid, attemptId).get();
      if (!snap.exists)
        throw new AttemptNotFoundError({ details: { attemptId } });
      return PublicAttemptSchema.parse(snap.data());
    });
  }

  async update<T>(
    uid: string,
    attemptId: string,
    change: (attempt: PublicAttempt) => T,
  ): Promise<T> {
    const ref = this.attemptRef(uid, attemptId);
    return this.guard('update', () =>
      this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
          throw new AttemptNotFoundError({ details: { attemptId } });
        const attempt = PublicAttemptSchema.parse(snap.data());
        const result = change(attempt);
        attempt.updatedAtMs = Date.now();
        tx.set(ref, PublicAttemptSchema.parse(attempt));
        return result;
      }),
    );
  }

  async appendWorkingNote(
    uid: string,
    attemptId: string,
    note: WorkingNote,
  ): Promise<void> {
    await this.guard('appendWorkingNote', async () => {
      const ref = this.workingNotesRef(uid, attemptId);
      const snap = await ref.get();
      const stored: unknown = snap.data()?.entries;
      const entries: Array<unknown> = Array.isArray(stored) ? stored : [];
      entries.push({ atMs: Date.now(), ...note });
      // One JSON string per entry: Firestore rejects nested arrays.
      await ref.set({
        entries: entries.map((e) =>
          typeof e === 'string' ? e : JSON.stringify(e),
        ),
      });
    });
  }

  private attemptsOf(uid: string) {
    return this.db.collection('users').doc(uid).collection('attempts');
  }

  private attemptRef(uid: string, attemptId: string): DocumentReference {
    return this.attemptsOf(uid).doc(attemptId);
  }

  // Server-only: the rules deny this path to every browser, even the owner's.
  private workingNotesRef(uid: string, attemptId: string): DocumentReference {
    return this.attemptRef(uid, attemptId).collection('private').doc('trace');
  }

  private async guard<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AttemptStoreError(
        `The attempt store failed during ${operation}.`,
        {
          cause: error,
          details: { operation },
        },
      );
    }
  }
}
