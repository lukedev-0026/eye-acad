import type { PublicCase } from '@/domain/case/case.schema';
import type { RenderedItem } from '@/domain/examiner/render';

import type { PublicAttempt, RevealedItem, Turn } from './attempt.schema';

export const MAX_TURNS = 120;
export const MAX_ATTEMPTS_PER_USER = 100;
export const MAX_ANSWER_CHARS = 4000;

export function newAttempt(c: PublicCase): PublicAttempt {
  const now = Date.now();
  return {
    caseId: c.caseId,
    caseTitle: c.title,
    caseFileHash: c.fileHash,
    phase: 'asking',
    createdAtMs: now,
    updatedAtMs: now,
    turns: [
      {
        n: 0,
        atMs: now,
        speaker: 'examiner',
        text: c.openingPrompt,
        kind: 'opening',
      },
    ],
    revealed: [],
    lastRequests: [],
    answer: null,
    followUp: null,
    followUpReply: null,
    revision: null,
    timings: [],
  };
}

export function pushTurn(
  attempt: PublicAttempt,
  turn: Omit<Turn, 'n' | 'atMs'>,
): Turn {
  const full: Turn = { ...turn, n: attempt.turns.length, atMs: Date.now() };
  attempt.turns.push(full);
  return full;
}

export function reveal(
  attempt: PublicAttempt,
  items: ReadonlyArray<RenderedItem>,
): void {
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
