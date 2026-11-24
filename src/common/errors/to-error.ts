import { AppError } from './app.error';
import { describeValue } from './describe-value';
import { InternalError } from './internal.error';

// `catch` hands over `unknown`: anything can be thrown. These turn whatever
// arrived into something that can be logged, wrapped or shown.

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : `Non-error thrown: ${describeValue(value)}`, { cause: value });
}

// Just the message, for building a new error's message from an old one.
export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : describeValue(value);
}

// "TypeError: fetch failed": the kind and the message on one line, for a
// record that keeps a failure as text.
export function describeError(value: unknown): string {
  return value instanceof Error ? `${value.name}: ${value.message}` : describeValue(value);
}

// Anything this project did not throw on purpose becomes an InternalError,
// with the original kept as its cause.
export function toAppError(value: unknown): AppError {
  return value instanceof AppError ? value : new InternalError({ cause: toError(value) });
}
