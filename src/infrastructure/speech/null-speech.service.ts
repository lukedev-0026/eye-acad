import type {
  SpeechService,
  SpokenReply,
  Transcription,
} from '@/domain/speech/speech.service';

/** Used when no speech key is set: replies are shown, not spoken. */
export class NullSpeechService implements SpeechService {
  readonly available = false;

  transcribe(): Promise<Transcription> {
    return Promise.resolve({
      ok: false,
      ms: 0,
      error: 'No Deepgram key is set.',
    });
  }

  speak(): Promise<SpokenReply | null> {
    return Promise.resolve(null);
  }

  prepare(): void {
    // Nothing to prepare.
  }
}
