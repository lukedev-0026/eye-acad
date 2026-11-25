import { randomUUID } from 'node:crypto';

import { deleteApp, initializeApp } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { newAttempt, pushTurn } from '@/domain/attempt/attempt';
import {
  AttemptNotFoundError,
  AttemptPhaseError,
} from '@/domain/attempt/attempt.error';
import { loadCase } from '@/infrastructure/files/case-file.loader';
import { FirestoreAttemptRepository } from '@/infrastructure/firestore/firestore-attempt.repository';

const PROJECT = 'demo-viva-repository-test';

let app: App;
let db: Firestore;
let repository: FirestoreAttemptRepository;

beforeAll(() => {
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', PROJECT);
  vi.stubEnv('METADATA_SERVER_DETECTION', 'none');
  app = initializeApp({ projectId: PROJECT }, 'repository-test');
  db = getFirestore(app);
  repository = new FirestoreAttemptRepository(db);
});

afterAll(async () => {
  await deleteApp(app);
  vi.unstubAllEnvs();
});

const freshUid = () => `trainee-${randomUUID()}`;
const blank = async () => newAttempt(await loadCase());

describe('the Firestore attempt store', () => {
  it('saves an attempt under its owner and reads it back unchanged', async () => {
    const uid = freshUid();
    const attempt = await blank();

    const attemptId = await repository.create(uid, attempt);

    expect(await repository.read(uid, attemptId)).toEqual(attempt);
    expect(await repository.count(uid)).toBe(1);
    expect(
      (await db.doc(`users/${uid}/attempts/${attemptId}`).get()).exists,
    ).toBe(true);
  });

  it('does not find an attempt through anyone but its owner', async () => {
    const attemptId = await repository.create(freshUid(), await blank());

    await expect(repository.read(freshUid(), attemptId)).rejects.toBeInstanceOf(
      AttemptNotFoundError,
    );
    await expect(
      repository.update(freshUid(), attemptId, () => undefined),
    ).rejects.toBeInstanceOf(AttemptNotFoundError);
  });

  it('applies a change and returns what the change returns', async () => {
    const uid = freshUid();
    const attemptId = await repository.create(uid, await blank());

    const turn = await repository.update(uid, attemptId, (a) =>
      pushTurn(a, { speaker: 'trainee', text: 'Hello' }),
    );
    const saved = await repository.read(uid, attemptId);

    expect(turn).toMatchObject({ n: 1, text: 'Hello' });
    expect(saved.turns).toHaveLength(2);
    expect(saved.updatedAtMs).toBeGreaterThanOrEqual(saved.createdAtMs);
  });

  it('saves nothing when the change throws, and passes the error on as it is', async () => {
    const uid = freshUid();
    const attemptId = await repository.create(uid, await blank());
    const refusal = new AttemptPhaseError(
      'An answer has already been given for this attempt.',
    );

    const update = repository.update(uid, attemptId, (a) => {
      a.phase = 'complete';
      throw refusal;
    });

    await expect(update).rejects.toBe(refusal);
    expect((await repository.read(uid, attemptId)).phase).toBe('asking');
  });

  it('never stores a field the public schema does not list', async () => {
    const uid = freshUid();
    const attemptId = await repository.create(uid, {
      ...(await blank()),
      diagnosis: 'hidden',
    } as Awaited<ReturnType<typeof blank>>);

    await repository.update(uid, attemptId, (a) => {
      Object.assign(a, { examinerNotes: 'hidden too' });
    });
    const stored =
      (await db.doc(`users/${uid}/attempts/${attemptId}`).get()).data() ?? {};

    expect(stored).not.toHaveProperty('diagnosis');
    expect(stored).not.toHaveProperty('examinerNotes');
  });

  it('keeps working notes beside the attempt, one JSON string per entry, in order', async () => {
    const uid = freshUid();
    const attemptId = await repository.create(uid, await blank());

    await repository.appendWorkingNote(uid, attemptId, {
      step: 'selector',
      picked: { requests: [['nested']] },
    });
    await repository.appendWorkingNote(uid, attemptId, {
      step: 'followup',
      path: 'written',
    });
    const stored = (
      await db.doc(`users/${uid}/attempts/${attemptId}/private/trace`).get()
    ).data() as {
      entries: Array<string>;
    };
    const entries = stored.entries.map(
      (entry) => JSON.parse(entry) as Record<string, unknown>,
    );

    expect(stored.entries.every((entry) => typeof entry === 'string')).toBe(
      true,
    );
    expect(entries.map((entry) => entry.step)).toEqual([
      'selector',
      'followup',
    ]);
    expect(entries[0]).toMatchObject({ picked: { requests: [['nested']] } });
    expect(typeof entries[0]?.atMs).toBe('number');
    expect(JSON.stringify(await repository.read(uid, attemptId))).not.toContain(
      'nested',
    );
  });
});
