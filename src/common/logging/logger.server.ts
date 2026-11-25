import pino from 'pino';
import pretty from 'pino-pretty';

import type { LogFormat, LogLevel } from '@/config/env.schema';
import { getConfig } from '@/config/env.server';

import { currentRequestContext } from './request-context.server';

// Never log trainee input, notes, audio, keys or tokens.

export type Logger = pino.Logger;

export type LogStream = 'stdout' | 'stderr';

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly format: LogFormat;
  readonly stream?: LogStream;
  readonly destination?: pino.DestinationStream;
}

const REDACTED_PATHS: ReadonlyArray<string> = [
  'authorization',
  '*.authorization',
  'headers.authorization',
  '*.headers.authorization',
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'idToken',
  '*.idToken',
  'password',
  '*.password',
  'audioBase64',
  '*.audioBase64',
];

const FILE_DESCRIPTOR: Record<LogStream, number> = { stdout: 1, stderr: 2 };

function destinationFor(
  format: LogFormat,
  stream: LogStream,
): pino.DestinationStream {
  const fd = FILE_DESCRIPTOR[stream];
  // In-process, not a worker thread: a line is never lost when a script ends.
  return format === 'pretty'
    ? pretty({
        destination: fd,
        sync: true,
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      })
    : pino.destination({ dest: fd, sync: true });
}

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: pino.stdSerializers.errWithCause },
      redact: { paths: [...REDACTED_PATHS], censor: '[REDACTED]' },
      mixin: () => ({ ...currentRequestContext() }),
    },
    options.destination ??
      destinationFor(options.format, options.stream ?? 'stdout'),
  );
}

function createRootLogger(): Logger {
  const { logging } = getConfig();
  const level =
    quietByDefault && !logging.levelWasSet && logging.level !== 'silent'
      ? 'warn'
      : logging.level;
  return createLogger({ level, format: logging.format, stream });
}

let root: Logger | undefined;
let stream: LogStream = 'stdout';
let quietByDefault = false;
const children = new Map<string, Logger>();

/** Logs go to stderr at warn level, so the tool's stdout stays clean. */
export function configureCommandLineLogging(): void {
  stream = 'stderr';
  quietByDefault = true;
  root = undefined;
  children.clear();
}

export function replaceRootLogger(logger?: Logger): void {
  root = logger;
  children.clear();
}

export function getLogger(component: string): Logger {
  const existing = children.get(component);
  if (existing) return existing;
  root ??= createRootLogger();
  const child = root.child({ component });
  children.set(component, child);
  return child;
}
