import type { AttemptRepository } from '@/domain/attempt/attempt.repository';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { SpeechService } from '@/domain/speech/speech.service';

export interface VivaDeps {
  readonly attempts: AttemptRepository;
  readonly models: LanguageModelGateway;
  readonly speech: SpeechService;
}
