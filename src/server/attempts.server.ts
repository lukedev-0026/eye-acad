import { PublicAttemptSchema } from '../lib/attempt-types';
import type { PublicAttempt, RevealedItem, Turn } from '../lib/attempt-types';
import type { PublicCase } from './case-schema';
import { getFirebaseAdmin } from './firebase-admin.server';
import type { RenderedItem } from './render';

// All writes to an attempt happen here, with the Admin SDK, at a path built
// from the verified uid. Browsers can only read (see firestore.rules).

export const MAX_TURNS = 120;
export const MAX_ATTEMPTS_PER_USER = 100;

export class AttemptError extends Error {}

const attemptsOf = (uid: string) => getFirebaseAdmin().db.collection('users').doc(uid).collection('attempts');

export const attemptRef = (uid: string, attemptId: string) => attemptsOf(uid).doc(attemptId);

// Server-only working notes for an attempt. The rules deny this path to every
// browser, including the owner's.
export const traceRef = (uid: string, attemptId: string) =>
  attemptRef(uid, attemptId).collection('private').doc('trace');

export async function createAttempt(uid: string, c: PublicCase): Promise<string> {
  const existing = await attemptsOf(uid).count().get();
  if (existing.data().count >= MAX_ATTEMPTS_PER_USER) {
    throw new AttemptError('This account has reached its limit of attempts.');
  }
  const now = Date.now();
  const attempt: PublicAttempt = {
    caseId: c.caseId,
    caseTitle: c.title,
    caseFileHash: c.fileHash,
    phase: 'asking',
    createdAtMs: now,
    updatedAtMs: now,
    turns: [{ n: 0, atMs: now, speaker: 'examiner', text: c.openingPrompt, kind: 'opening' }],
    revealed: [],
    lastRequests: [],
    answer: null,
    followUp: null,
    followUpReply: null,
    revision: null,
    timings: [],
  };
  const ref = attemptsOf(uid).doc();
  await ref.set(PublicAttemptSchema.parse(attempt));
  return ref.id;
}

export async function readAttempt(uid: string, attemptId: string): Promise<PublicAttempt> {
  const snap = await attemptRef(uid, attemptId).get();
  if (!snap.exists) throw new AttemptError('Attempt not found.');
  return PublicAttemptSchema.parse(snap.data());
}

// Reads the attempt, lets `change` edit a copy, and saves it back through the
// allowlist, all inside one transaction so two requests cannot interleave.
export async function updateAttempt<T>(
  uid: string,
  attemptId: string,
  change: (attempt: PublicAttempt) => T,
): Promise<T> {
  const ref = attemptRef(uid, attemptId);
  return getFirebaseAdmin().db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AttemptError('Attempt not found.');
    const attempt = PublicAttemptSchema.parse(snap.data());
    const result = change(attempt);
    attempt.updatedAtMs = Date.now();
    tx.set(ref, PublicAttemptSchema.parse(attempt));
    return result;
  });
}

export function pushTurn(attempt: PublicAttempt, turn: Omit<Turn, 'n' | 'atMs'>): Turn {
  const full: Turn = { ...turn, n: attempt.turns.length, atMs: Date.now() };
  attempt.turns.push(full);
  return full;
}

// Adds newly revealed items, keeping the first snapshot of anything already
// shown.
export function reveal(attempt: PublicAttempt, items: Array<RenderedItem>) {
  const now = Date.now();
  for (const item of items) {
    if (attempt.revealed.some((r) => r.id === item.id)) continue;
    const snapshot: RevealedItem = {
      id: item.id,
      kind: item.kind,
      eyeLabel: item.eyeLabel,
      label: item.label,
      value: item.value,
      method: item.method,
      available: item.available,
      display: item.display,
      atMs: now,
    };
    attempt.revealed.push(snapshot);
  }
}

// Appends one entry to the server-only working notes.
export async function trace(uid: string, attemptId: string, entry: Record<string, unknown>): Promise<void> {
  const ref = traceRef(uid, attemptId);
  const snap = await ref.get();
  const entries = (snap.data()?.entries as Array<unknown> | undefined) ?? [];
  entries.push({ atMs: Date.now(), ...entry });
  // Stored as one JSON string per entry: Firestore rejects nested arrays, and
  // model output can contain them.
  await ref.set({ entries: entries.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))) });
}
