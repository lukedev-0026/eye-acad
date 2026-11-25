import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-viva-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice/attempts/a1'), { phase: 'asking' });
    await setDoc(doc(db, 'users/alice/attempts/a1/private/trace'), {
      entries: [],
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('attempts are private to their owner', () => {
  it('the owner can open and list their attempts', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/attempts/a1')));
    await assertSucceeds(getDocs(collection(db, 'users/alice/attempts')));
  });
  it('another trainee cannot open or list them', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(db, 'users/alice/attempts/a1')));
    await assertFails(getDocs(collection(db, 'users/alice/attempts')));
  });
  it('a signed-out visitor cannot open them', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/alice/attempts/a1')));
  });
  it('no browser can write an attempt, not even its owner', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(
      updateDoc(doc(alice, 'users/alice/attempts/a1'), { phase: 'complete' }),
    );
    await assertFails(
      setDoc(doc(alice, 'users/alice/attempts/new'), { phase: 'asking' }),
    );
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(doc(bob, 'users/alice/attempts/a1'), { phase: 'complete' }),
    );
  });
  it('the server-only working notes are closed to everyone, owner included', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(
      getDoc(doc(alice, 'users/alice/attempts/a1/private/trace')),
    );
    await assertFails(
      getDocs(collection(alice, 'users/alice/attempts/a1/private')),
    );
  });
});
