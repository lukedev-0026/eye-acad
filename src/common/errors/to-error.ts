import { AppError } from './app.error';
import { describeValue } from './describe-value';
import { InternalError } from './internal.error';

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(
    typeof value === 'string'
      ? value
      : `Non-error thrown: ${describeValue(value)}`,
    { cause: value },
  );
}

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : describeValue(value);
}

export function describeError(value: unknown): string {
  return value instanceof Error
    ? `${value.name}: ${value.message}`
    : describeValue(value);
}

/** Anything not thrown on purpose becomes an InternalError (cause kept). */
export function toAppError(value: unknown): AppError {
  return value instanceof AppError
    ? value
    : new InternalError({ cause: toError(value) });
}
