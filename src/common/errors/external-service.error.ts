import { AppError } from './app.error';
import type { AppErrorOptions } from './app.error';

export type ExternalService =
  'ollama' | 'anthropic' | 'deepgram' | 'firestore' | 'firebase-auth';

export abstract class ExternalServiceError extends AppError {
  readonly status = 502;
  readonly service: ExternalService;

  protected constructor(
    service: ExternalService,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { ...options, details: { service, ...options.details } });
    this.service = service;
  }
}

export class ModelProviderError extends ExternalServiceError {
  override readonly name = 'ModelProviderError';
  readonly code = 'MODEL_PROVIDER_FAILED';

  constructor(
    service: 'ollama' | 'anthropic',
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(service, message, options);
  }
}

export class AttemptStoreError extends ExternalServiceError {
  override readonly name = 'AttemptStoreError';
  readonly code = 'ATTEMPT_STORE_FAILED';

  constructor(message: string, options: AppErrorOptions = {}) {
    super('firestore', message, options);
  }
}
