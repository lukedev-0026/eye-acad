import { describe, expect, it } from 'vitest';

import {
  canTraineeAct,
  hintFor,
  nextTurnState,
} from '@/features/viva/lib/turn-machine';

describe('whose turn it is', () => {
  it('follows a spoken turn from start to finish', () => {
    let s = nextTurnState('your_turn', { type: 'START_LISTENING' });
    expect(s).toBe('listening');
    s = nextTurnState(s, { type: 'STOP_LISTENING' });
    expect(s).toBe('thinking');
    s = nextTurnState(s, { type: 'REPLY_SPEAKING' });
    expect(s).toBe('speaking');
    s = nextTurnState(s, { type: 'SPEECH_ENDED' });
    expect(s).toBe('your_turn');
  });
  it('does not let the trainee start while the examiner is thinking or speaking', () => {
    expect(nextTurnState('thinking', { type: 'START_LISTENING' })).toBe(
      'thinking',
    );
    expect(nextTurnState('speaking', { type: 'START_LISTENING' })).toBe(
      'speaking',
    );
    expect(nextTurnState('speaking', { type: 'SUBMIT_TEXT' })).toBe('speaking');
    expect(canTraineeAct('speaking')).toBe(false);
    expect(canTraineeAct('thinking')).toBe(false);
    expect(canTraineeAct('listening')).toBe(false);
  });
  it('hands the turn back after any failure', () => {
    for (const s of ['listening', 'thinking', 'speaking'] as const) {
      expect(nextTurnState(s, { type: 'FAILED' })).toBe('your_turn');
    }
  });
  it('returns to the trainee when there is text but no audio', () => {
    expect(nextTurnState('thinking', { type: 'REPLY_SILENT' })).toBe(
      'your_turn',
    );
  });
  it('tells the trainee what to do next, by what they are doing', () => {
    expect(hintFor('asking', 'your_turn')).toBe(
      'Hold the button and ask for a finding, or type a request.',
    );
    expect(hintFor('answering', 'your_turn')).toBe(
      'Give your diagnosis and immediate management, then submit.',
    );
    expect(hintFor('follow_up', 'your_turn')).toBe(
      'Reply to the follow-up question, then send.',
    );
    expect(hintFor('asking', 'speaking')).toBe(
      'Please wait until the examiner has finished.',
    );
  });
});
