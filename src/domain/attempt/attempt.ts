import type { PublicCase } from '@/domain/case/case.schema';
import type { RenderedItem } from '@/domain/examiner/render';

import type { PublicAttempt, RevealedItem, Turn } from './attempt.schema';

// What an attempt is and how it changes, with no storage in sight. The store
// (see attempt.repository.ts) keeps whatever these functions produce.

export const MAX_TURNS = 120;
export const MAX_ATTEMPTS_PER_USER = 100;
// The longest answer, or reply to the follow-up, that is kept and judged.
export const MAX_ANSWER_CHARS = 4000;

// A new attempt at a case: the examiner's opening words, and nothing revealed.
export function newAttempt(c: PublicCase): PublicAttempt {
  const now = Date.now();
  return {
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
}

export function pushTurn(attempt: PublicAttempt, turn: Omit<Turn, 'n' | 'atMs'>): Turn {
  const full: Turn = { ...turn, n: attempt.turns.length, atMs: Date.now() };
  attempt.turns.push(full);
  return full;
}

// Adds newly revealed items, keeping the first snapshot of anything already
// shown.
export function reveal(attempt: PublicAttempt, items: ReadonlyArray<RenderedItem>): void {
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
