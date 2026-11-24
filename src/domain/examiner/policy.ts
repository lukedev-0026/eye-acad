import type { PublicCase } from '@/domain/case/case.schema';

import type { Catalogue } from './catalogue';
import { LINES } from './lines';
import { composeSpeechParts, renderFinding, renderHistory } from './render';
import type { RenderedItem } from './render';
import type { SelectorOutput } from './selector.schema';

// Turns the selector's choices into what the examiner does. Pure code: the
// same choices always produce the same reply.

export const MAX_ITEMS_PER_TURN = 6;

export type TurnDecision =
  | { kind: 'reveal'; items: Array<RenderedItem>; alsoNotRecorded: boolean }
  | { kind: 'not_recorded' }
  | { kind: 'too_many' }
  | { kind: 'wants_to_answer' }
  | { kind: 'other' };

export function decide(c: PublicCase, catalogue: Catalogue, selected: SelectorOutput): TurnDecision {
  // Starting an answer never changes phase by itself; only the button does.
  if (selected.intent === 'wants_to_answer') return { kind: 'wants_to_answer' };

  const findingIds = new Set<string>();
  const historyKeys = new Set<string>();
  let missed = selected.not_in_catalogue;

  for (const request of selected.requests) {
    const item = catalogue.items.find((i) => i.name === request.item);
    if (!item) {
      missed = true;
      continue;
    }
    if (item.kind === 'history') {
      historyKeys.add(item.key);
      continue;
    }
    const rows = c.findings.filter((f) => f.label === item.label);
    // No eye named means every row with that label; an eye is never guessed.
    // A row recorded for both eyes, or for no eye, answers a request for
    // either eye.
    const wanted =
      request.eye === 'right' || request.eye === 'left'
        ? rows.filter((f) => f.eye === request.eye || f.eye === 'both' || f.eye === null)
        : rows;
    if (wanted.length === 0) missed = true;
    for (const f of wanted) findingIds.add(f.id);
  }

  const count = findingIds.size + historyKeys.size;
  if (count === 0) {
    return missed || selected.intent === 'request_items' ? { kind: 'not_recorded' } : { kind: 'other' };
  }
  if (count > MAX_ITEMS_PER_TURN) return { kind: 'too_many' };

  // Case-file order, findings first, whatever order they were asked in.
  const items = [
    ...c.findings.filter((f) => findingIds.has(f.id)).map(renderFinding),
    ...Object.entries(c.patient)
      .filter(([key]) => historyKeys.has(key))
      .map(([key, value]) => renderHistory(key, value)),
  ];
  return { kind: 'reveal', items, alsoNotRecorded: missed };
}

export type ExaminerReply = {
  kind: TurnDecision['kind'] | 'did_not_catch' | 'error';
  // What is shown, one entry per line.
  lines: Array<string>;
  // What is said. Built from the same items, so it cannot differ in substance.
  speech: string;
  // The same words, one sentence group per item. Each is synthesised (and
  // kept) on its own, so a reply about two eyes does not wait twice as long.
  speechParts: Array<string>;
  items: Array<RenderedItem>;
};

export function replyFor(decision: TurnDecision): ExaminerReply {
  switch (decision.kind) {
    case 'reveal': {
      const tail = decision.alsoNotRecorded ? [LINES.alsoNotRecorded] : [];
      const speechParts = [
        ...composeSpeechParts(
          decision.items.map((i) => i.speech),
          LINES.restOnScreen,
        ),
        ...tail,
      ];
      return {
        kind: 'reveal',
        lines: [...decision.items.map((i) => i.display), ...tail],
        speech: speechParts.join(' '),
        speechParts,
        items: decision.items,
      };
    }
    case 'not_recorded':
      return fixedReply('not_recorded', LINES.notRecorded);
    case 'too_many':
      return fixedReply('too_many', LINES.tooMany);
    case 'wants_to_answer':
      return fixedReply('wants_to_answer', LINES.pressTheButton);
    case 'other':
      return fixedReply('other', LINES.askForAFinding);
  }
}

export function fixedReply(kind: ExaminerReply['kind'], line: string): ExaminerReply {
  return { kind, lines: [line], speech: line, speechParts: [line], items: [] };
}
