import type { SpeechService, SpokenReply, Transcription } from '@/domain/speech/speech.service';

// What the app runs on when no speech key is set: everything still works by
// typing, and replies are shown and not spoken.
export class NullSpeechService implements SpeechService {
  readonly available = false;

  transcribe(): Promise<Transcription> {
    return Promise.resolve({ ok: false, ms: 0, error: 'No Deepgram key is set.' });
  }

  speak(): Promise<SpokenReply | null> {
    return Promise.resolve(null);
  }

  prepare(): void {
    // Nothing to prepare.
  }
}
