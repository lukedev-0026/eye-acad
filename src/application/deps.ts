import type { AttemptRepository } from '@/domain/attempt/attempt.repository';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';

// What a use case is handed, as opposed to what it imports. These are the
// things with a real alternative: a different vendor, or a stand-in under
// test. Pure rules and local file loaders are imported directly.
export interface VivaDeps {
  readonly attempts: AttemptRepository;
  readonly models: LanguageModelGateway;
}
