// Speech in and speech out. The words to be spoken are always built by code
// before they reach a speech service, so the voice can only ever say what is
// also shown.

export type Transcription =
  | { readonly ok: true; readonly text: string; readonly ms: number; readonly model: string }
  | { readonly ok: false; readonly ms: number; readonly error: string };

export interface SpeechClip {
  readonly audioBase64: string;
  readonly mimeType: 'audio/mpeg';
}

export interface SpokenReply {
  // One clip per sentence group, in order. They travel together in one reply
  // and are played back to back.
  readonly clips: ReadonlyArray<SpeechClip>;
  // Time this reply spent waiting for synthesis. Zero when every clip was
  // already held.
  readonly ms: number;
  readonly fromCache: number;
  readonly voice: string;
}

export interface SpeechService {
  // False when there is no speech at all (no key): replies are shown, not spoken.
  readonly available: boolean;

  // `keyterms` are the names of the findings in the current case. They nudge
  // recognition towards clinical words; they are names only, never results.
  transcribe(audio: Uint8Array, mimeType: string, keyterms: ReadonlyArray<string>): Promise<Transcription>;

  // Speaks a reply made of several sentence groups. Returns null when it
  // cannot be spoken; the caller still shows the text, so a missing key or a
  // failed request never blocks the session. If any part fails, nothing is
  // spoken at all: saying only some of what is on screen would be worse than
  // saying none of it.
  speak(parts: ReadonlyArray<string>): Promise<SpokenReply | null>;

  // Makes the audio for a set of sentences ahead of time, in the background.
  // Never throws and returns at once.
  prepare(parts: ReadonlyArray<string>): void;
}
