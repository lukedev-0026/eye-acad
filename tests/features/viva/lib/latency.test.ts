import { describe, expect, it } from 'vitest';

import { asTsv, summarise } from '@/features/viva/lib/latency';
import type { TurnTiming } from '@/features/viva/lib/latency';

const turn = (n: number, via: TurnTiming['via'], toPlaybackMs: number | null): TurnTiming => ({
  n,
  via,
  toResponseMs: 900,
  toPlaybackMs,
  server: { speechToTextMs: via === 'voice' ? 300 : null, modelMs: 450, textToSpeechMs: 200, serverTotalMs: 980 },
});

describe('response times for the write-up', () => {
  it('summarises spoken turns whose reply was played, and nothing else', () => {
    const timings = [turn(1, 'voice', 2000), turn(2, 'typed', 1500), turn(3, 'voice', null), turn(4, 'voice', 3000)];

    expect(summarise(timings)).toEqual({ n: 2, medianMs: 2500, minMs: 2000, maxMs: 3000 });
  });

  it('has nothing to say until a spoken reply has been played', () => {
    expect(summarise([])).toBeNull();
    expect(summarise([turn(1, 'typed', 1200), turn(2, 'voice', null)])).toBeNull();
  });

  it('writes one line per turn, leaving a gap where a step did not happen', () => {
    const [head, spoken, typed] = asTsv([turn(1, 'voice', 2000), turn(2, 'typed', null)]).split('\n');

    expect(head?.split('\t')).toEqual([
      'turn',
      'via',
      'release_to_response_ms',
      'release_to_playback_ms',
      'speech_to_text_ms',
      'model_ms',
      'text_to_speech_ms',
      'server_total_ms',
    ]);
    expect(spoken).toBe('1\tvoice\t900\t2000\t300\t450\t200\t980');
    expect(typed).toBe('2\ttyped\t900\t\t\t450\t200\t980');
  });
});
