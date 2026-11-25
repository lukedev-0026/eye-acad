// Strings only: Firestore retries a transaction on a numeric `code`.
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
  'NOTE_PREPARATION_FAILED',
  'REVISION_UNAVAILABLE',
  'CONFIG_INVALID',
  'SETTINGS_FILE_INVALID',
  'MODEL_PROVIDER_FAILED',
  'ATTEMPT_STORE_FAILED',
  'EVAL_TOO_MANY_INFRA_ERRORS',
  'EVAL_OUT_OF_TIME',
  'EVAL_LOW_BATTERY',
  'EVAL_INVALID_CASE',
  'EVAL_REFUSED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === 'string' &&
    (ERROR_CODES as ReadonlyArray<string>).includes(value)
  );
}
