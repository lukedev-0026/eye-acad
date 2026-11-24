import { getConfig } from '@/config/env.server';
import { getFirebaseAdmin } from '@/infrastructure/firestore/firebase-admin';
import { FirestoreAttemptRepository } from '@/infrastructure/firestore/firestore-attempt.repository';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

import type { VivaDeps } from './deps';

let cached: VivaDeps | undefined;

// The real things, wired together once and on first use. The server functions
// and the command-line tools both start here.
export function getContainer(): VivaDeps {
  cached ??= {
    attempts: new FirestoreAttemptRepository(getFirebaseAdmin().db),
    models: createLanguageModelGateway(getConfig()),
  };
  return cached;
}
