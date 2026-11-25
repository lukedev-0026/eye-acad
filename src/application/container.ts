import { getConfig } from '@/config/env.server';
import { getFirebaseAdmin } from '@/infrastructure/firestore/firebase-admin';
import { FirestoreAttemptRepository } from '@/infrastructure/firestore/firestore-attempt.repository';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';
import { createSpeechService } from '@/infrastructure/speech/deepgram-speech.service';

import type { VivaDeps } from './deps';

let cached: VivaDeps | undefined;

/** The real dependencies, wired once on first use. */
export function getContainer(): VivaDeps {
  cached ??= {
    attempts: new FirestoreAttemptRepository(getFirebaseAdmin().db),
    models: createLanguageModelGateway(getConfig()),
    speech: createSpeechService(getConfig().deepgram),
  };
  return cached;
}
