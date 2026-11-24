import { describe, expect, it } from 'vitest';
import { canTraineeAct, nextTurnState } from '../src/lib/turn-machine';

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
    expect(nextTurnState('thinking', { type: 'START_LISTENING' })).toBe('thinking');
    expect(nextTurnState('speaking', { type: 'START_LISTENING' })).toBe('speaking');
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
    expect(nextTurnState('thinking', { type: 'REPLY_SILENT' })).toBe('your_turn');
  });
});
