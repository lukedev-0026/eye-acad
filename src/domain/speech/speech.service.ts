export type Transcription =
  | {
      readonly ok: true;
      readonly text: string;
      readonly ms: number;
      readonly model: string;
    }
  | { readonly ok: false; readonly ms: number; readonly error: string };

export interface SpeechClip {
  readonly audioBase64: string;
  readonly mimeType: 'audio/mpeg';
}

export interface SpokenReply {
  readonly clips: ReadonlyArray<SpeechClip>;
  readonly ms: number;
  readonly fromCache: number;
  readonly voice: string;
}

export interface SpeechService {
  readonly available: boolean;

  transcribe(
    audio: Uint8Array,
    mimeType: string,
    keyterms: ReadonlyArray<string>,
  ): Promise<Transcription>;

  /** Null when any part cannot be spoken: partial speech is worse. */
  speak(parts: ReadonlyArray<string>): Promise<SpokenReply | null>;

  prepare(parts: ReadonlyArray<string>): void;
}
