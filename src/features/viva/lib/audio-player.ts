export interface ReplyAudio {
  base64: string;
  mimeType: string;
}

// Plays the clips of one reply back to back. They all arrived inside the same
// server reply. Resolves `started` with the time the first clip began playing
// and `ended` when the last one finishes. A failure to play is never an error
// for the caller: the words are on screen anyway.
export function playReply(clips: Array<ReplyAudio>): {
  started: Promise<number | null>;
  ended: Promise<void>;
  stop: () => void;
} {
  const urls = clips.map((clip) => {
    const bytes = Uint8Array.from(atob(clip.base64), (ch) => ch.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: clip.mimeType }));
  });
  // Created up front so each clip is decoded and ready when its turn comes.
  const elements = urls.map((url) => {
    const element = new Audio(url);
    element.preload = 'auto';
    return element;
  });
  const stopping = new AbortController();
  let current: HTMLAudioElement | null = null;
  let resolveStarted: (at: number | null) => void = () => {
    // Replaced on the next line, before anything can call it.
  };
  const started = new Promise<number | null>((resolve) => {
    resolveStarted = resolve;
  });

  const playOne = (element: HTMLAudioElement, first: boolean) =>
    new Promise<void>((done) => {
      current = element;
      // `playing` fires when the browser has audio ready and has begun to
      // output it. It marks "playback ready", not the instant sound reaches
      // the ear.
      if (first)
        element.addEventListener(
          'playing',
          () => {
            resolveStarted(performance.now());
          },
          { once: true },
        );
      element.addEventListener(
        'ended',
        () => {
          done();
        },
        { once: true },
      );
      element.addEventListener(
        'error',
        () => {
          done();
        },
        { once: true },
      );
      element.play().catch(() => {
        done();
      });
    });

  const ended = (async () => {
    for (const [i, element] of elements.entries()) {
      if (stopping.signal.aborted) break;
      await playOne(element, i === 0);
    }
    resolveStarted(null);
    for (const url of urls) URL.revokeObjectURL(url);
  })();

  return {
    started,
    ended,
    stop: () => {
      stopping.abort();
      current?.pause();
      current?.dispatchEvent(new Event('ended'));
    },
  };
}
