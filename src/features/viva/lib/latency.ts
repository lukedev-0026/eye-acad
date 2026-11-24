// The timing of one voice turn, as the trainee experiences it.
//
// The timer STARTS when the trainee releases the talk button (the moment they
// have finished speaking) and STOPS when the browser reports the reply audio
// is playing. It therefore includes: upload, speech-to-text, the model call,
// building the sentence, text-to-speech, download and decode. It excludes the
// time the trainee spent speaking, and the playing time of the reply itself.
export type TurnTiming = {
  n: number;
  via: 'voice' | 'typed';
  // Release -> the server's reply arrived in the browser.
  toResponseMs: number;
  // Release -> reply audio playing. Null if no audio was played.
  toPlaybackMs: number | null;
  server: {
    speechToTextMs: number | null;
    modelMs: number | null;
    textToSpeechMs: number | null;
    serverTotalMs: number;
  };
};

export function median(values: Array<number>): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarise(timings: Array<TurnTiming>) {
  const played = timings
    .filter((t) => t.via === 'voice' && t.toPlaybackMs !== null)
    .map((t) => t.toPlaybackMs as number);
  return played.length
    ? { n: played.length, medianMs: median(played), minMs: Math.min(...played), maxMs: Math.max(...played) }
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
