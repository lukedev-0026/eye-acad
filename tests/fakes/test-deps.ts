import type { VivaDeps } from '@/application/deps';
import { loadConfig } from '@/config/env.server';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';
import { NullSpeechService } from '@/infrastructure/speech/null-speech.service';

import { InMemoryAttemptRepository } from './in-memory-attempt.repository';

export interface TestDeps extends VivaDeps {
  readonly attempts: InMemoryAttemptRepository;
  readonly speech: NullSpeechService;
}

/**
 * In-memory store, no speech, and the real gateway
 * (fake the network with scriptModel).
 */
export function testDeps(): TestDeps {
  return {
    attempts: new InMemoryAttemptRepository(),
    models: createLanguageModelGateway(loadConfig({})),
    speech: new NullSpeechService(),
  };
}
