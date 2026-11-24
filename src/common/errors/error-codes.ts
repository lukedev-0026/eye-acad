// Every code an error can carry. A code is a stable, machine-readable name: the
// browser switches on it, logs are searched by it, and it never changes with
// the wording of a message. Always a string: Firestore retries a transaction
// when it sees a numeric `code` on a thrown error.
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_INPUT',
  'ATTEMPT_NOT_FOUND',
  'ATTEMPT_WRONG_PHASE',
  'ATTEMPT_LIMIT_REACHED',
  'ANSWER_EMPTY',
  'CASE_FILE_INVALID',
  'NOTE_INDEX_MISSING',
  'NOTE_INDEX_STALE',
  'REVISION_UNAVAILABLE',
  'CONFIG_INVALID',
  'SETTINGS_FILE_INVALID',
  'MODEL_PROVIDER_FAILED',
  'SPEECH_SERVICE_FAILED',
  'EMBEDDING_SERVICE_FAILED',
  'ATTEMPT_STORE_FAILED',
  'EVAL_TOO_MANY_INFRA_ERRORS',
  'EVAL_OUT_OF_TIME',
  'EVAL_LOW_BATTERY',
  'EVAL_INVALID_CASE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as ReadonlyArray<string>).includes(value);
}
