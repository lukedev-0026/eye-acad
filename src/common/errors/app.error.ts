import { describeValue } from './describe-value';
import type { ErrorCode } from './error-codes';

export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface AppErrorOptions {
  readonly cause?: unknown;
  readonly details?: ErrorDetails;
}

export interface SerialisedError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly details?: ErrorDetails;
  readonly cause?: SerialisedError;
}

/** Root of every deliberate error. `expose` marks a message safe to show. */
export abstract class AppError extends Error {
  // A literal per subclass: minified builds break `constructor.name`.
  abstract override readonly name: string;
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
  readonly expose: boolean = false;
  readonly details: ErrorDetails | undefined;

  protected constructor(message: string, options: AppErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.details = options.details;
  }

  get rootCause(): unknown {
    return deepestCause(this);
  }

  toJSON(): SerialisedError {
    return serialiseError(this);
  }
}

const MAX_CAUSE_DEPTH = 8;

function deepestCause(error: Error): unknown {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error) || current.cause === undefined) break;
    current = current.cause;
  }
  return current;
}

export function serialiseError(value: unknown, depth = 0): SerialisedError {
  if (!(value instanceof Error)) {
    return { name: 'NonError', message: describeValue(value) };
  }
  const isApp = value instanceof AppError;
  return {
    name: value.name,
    message: value.message,
    ...(isApp ? { code: value.code } : {}),
    ...(isApp && value.details ? { details: value.details } : {}),
    ...(value.cause !== undefined && depth < MAX_CAUSE_DEPTH
      ? { cause: serialiseError(value.cause, depth + 1) }
      : {}),
  };
}
