import type { ErrorCode } from './error-codes';

export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface AppErrorOptions {
  // Whatever was caught. Kept whole, so the log shows the full chain.
  readonly cause?: unknown;
  // Facts about the failure that are safe to log: ids, counts, names.
  readonly details?: ErrorDetails;
}

export interface SerialisedError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly details?: ErrorDetails;
  readonly cause?: SerialisedError;
}

// The root of every error this project throws on purpose.
//
// A subclass says what went wrong (`code`), what the HTTP reply should be
// (`status`), and whether its message was written for the trainee to read
// (`expose`). Whatever was caught on the way is kept as `cause`.
export abstract class AppError extends Error {
  // A literal in every subclass. Class names are shortened when the browser
  // bundle is built, so `constructor.name` cannot be relied on there.
  abstract override readonly name: string;
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
  readonly expose: boolean = false;
  readonly details: ErrorDetails | undefined;

  protected constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.details = options.details;
  }

  // The first thing that went wrong, however many times it was wrapped.
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

// An error, and the chain of causes under it, as plain data.
export function serialiseError(value: unknown, depth = 0): SerialisedError {
  if (!(value instanceof Error)) {
    return { name: 'NonError', message: typeof value === 'string' ? value : describeValue(value) };
  }
  const isApp = value instanceof AppError;
  return {
    name: value.name,
    message: value.message,
    ...(isApp ? { code: value.code } : {}),
    ...(isApp && value.details ? { details: value.details } : {}),
    ...(value.cause !== undefined && depth < MAX_CAUSE_DEPTH ? { cause: serialiseError(value.cause, depth + 1) } : {}),
  };
}

function describeValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
