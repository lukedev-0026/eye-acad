import { median } from '@/common/stats';

export interface TurnTiming {
  n: number;
  via: 'voice' | 'typed';
  toResponseMs: number;
  toPlaybackMs: number | null;
  server: {
    speechToTextMs: number | null;
    modelMs: number | null;
    textToSpeechMs: number | null;
    serverTotalMs: number;
  };
}

export interface TimingSummary {
  n: number;
  medianMs: number | null;
  minMs: number;
  maxMs: number;
}

/** Spoken turns whose reply was played; null when there are none yet. */
export function summarise(
  timings: ReadonlyArray<TurnTiming>,
): TimingSummary | null {
  const played = timings.flatMap((t) =>
    t.via === 'voice' && t.toPlaybackMs !== null ? [t.toPlaybackMs] : [],
  );
  return played.length
    ? {
        n: played.length,
        medianMs: median(played),
        minMs: Math.min(...played),
        maxMs: Math.max(...played),
      }
    : null;
}

export function asTsv(timings: Array<TurnTiming>): string {
  const head = [
    'turn',
    'via',
    'release_to_response_ms',
    'release_to_playback_ms',
    'speech_to_text_ms',
    'model_ms',
    'text_to_speech_ms',
    'server_total_ms',
  ];
  const rows = timings.map((t) =>
    [
      t.n,
      t.via,
      t.toResponseMs,
      t.toPlaybackMs ?? '',
      t.server.speechToTextMs ?? '',
      t.server.modelMs ?? '',
      t.server.textToSpeechMs ?? '',
      t.server.serverTotalMs,
    ].join('\t'),
  );
  return [head.join('\t'), ...rows].join('\n');
}
