import { AppError } from './app.error';
import type { AppErrorOptions } from './app.error';

export type ExternalService = 'ollama' | 'anthropic' | 'deepgram' | 'firestore' | 'firebase-auth';

// A service outside this process failed or could not be reached. The vendor's
// own error is the `cause`; it is logged and never shown to the trainee.
export abstract class ExternalServiceError extends AppError {
  readonly status = 502;
  readonly service: ExternalService;

  protected constructor(service: ExternalService, message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, details: { service, ...options.details } });
    this.service = service;
  }
}

export class ModelProviderError extends ExternalServiceError {
  override readonly name = 'ModelProviderError';
  readonly code = 'MODEL_PROVIDER_FAILED';

  constructor(service: 'ollama' | 'anthropic', message: string, options: AppErrorOptions = {}) {
    super(service, message, options);
  }
}

export class SpeechServiceError extends ExternalServiceError {
  override readonly name = 'SpeechServiceError';
  readonly code = 'SPEECH_SERVICE_FAILED';

  constructor(message: string, options: AppErrorOptions = {}) {
    super('deepgram', message, options);
  }
}

export class EmbeddingServiceError extends ExternalServiceError {
  override readonly name = 'EmbeddingServiceError';
  readonly code = 'EMBEDDING_SERVICE_FAILED';

  constructor(message: string, options: AppErrorOptions = {}) {
    super('ollama', message, options);
  }
}

export class AttemptStoreError extends ExternalServiceError {
  override readonly name = 'AttemptStoreError';
  readonly code = 'ATTEMPT_STORE_FAILED';

  constructor(message: string, options: AppErrorOptions = {}) {
    super('firestore', message, options);
  }
}
