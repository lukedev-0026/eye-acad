import type { VivaDeps } from '@/application/deps';
import { loadConfig } from '@/config/env.server';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';
import { NullSpeechService } from '@/infrastructure/speech/null-speech.service';

import { InMemoryAttemptRepository } from './in-memory-attempt.repository';

export interface TestDeps extends VivaDeps {
  readonly attempts: InMemoryAttemptRepository;
  readonly speech: NullSpeechService;
}

// What a use case is handed under test: an attempt store in memory, no speech,
// and the real model gateway, which talks to whatever stands in for the
// network (see scripted-model.ts).
export function testDeps(): TestDeps {
  return {
    attempts: new InMemoryAttemptRepository(),
    models: createLanguageModelGateway(loadConfig({})),
    speech: new NullSpeechService(),
  };
}
