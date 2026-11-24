import { loadConfig } from '@/config/env.server';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

import { InMemoryAttemptRepository } from './in-memory-attempt.repository';

// What a use case is handed under test: an attempt store in memory, and the
// real model gateway, which talks to whatever stands in for the network
// (see scripted-model.ts).
export function testDeps() {
  return {
    attempts: new InMemoryAttemptRepository(),
    models: createLanguageModelGateway(loadConfig({})),
  };
}
