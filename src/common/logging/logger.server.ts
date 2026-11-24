import pino from 'pino';
import pretty from 'pino-pretty';

import type { LogFormat, LogLevel } from '@/config/env.schema';
import { getConfig } from '@/config/env.server';

import { currentRequestContext } from './request-context.server';

// Structured logging. One JSON object per line, or the same thing made
// readable while developing.
//
// How to write a line: the facts first, as an object; then a short message
// naming what happened as `function.action.result`. Values never go in the
// message, so lines can be searched and counted.
//
//   log.info({ actionResult: 'SUCCESS', step, model, durationMs }, 'callStep.completed');
//
// What never goes in a line: what the trainee said or typed, the examiner's
// notes, audio, keys or tokens.

export type Logger = pino.Logger;

export type LogStream = 'stdout' | 'stderr';

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly format: LogFormat;
  // The server writes to stdout. Command-line tools write to stderr, so their
  // own output on stdout stays clean.
  readonly stream?: LogStream;
  // For tests: lines are written here and nowhere else.
  readonly destination?: pino.DestinationStream;
}

// Belt and braces: nothing should put these in a line, and if something does,
// the value is replaced.
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

function destinationFor(format: LogFormat, stream: LogStream): pino.DestinationStream {
  const fd = FILE_DESCRIPTOR[stream];
  // Written in this process, not through a worker thread, so a line is never
  // lost when a script ends.
  return format === 'pretty'
    ? pretty({ destination: fd, sync: true, colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' })
    : pino.destination({ dest: fd, sync: true });
}

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      // An error is logged with everything under it: its code, its details and
      // the whole chain of causes.
      serializers: { err: pino.stdSerializers.errWithCause },
      redact: { paths: [...REDACTED_PATHS], censor: '[REDACTED]' },
      mixin: () => ({ ...currentRequestContext() }),
    },
    options.destination ?? destinationFor(options.format, options.stream ?? 'stdout'),
  );
}

function createRootLogger(): Logger {
  const { logging } = getConfig();
  const level = quietByDefault && !logging.levelWasSet && logging.level !== 'silent' ? 'warn' : logging.level;
  return createLogger({ level, format: logging.format, stream });
}

let root: Logger | undefined;
let stream: LogStream = 'stdout';
let quietByDefault = false;
const children = new Map<string, Logger>();

// Command-line tools call this first. Their own output goes to stdout, so
// their log lines go to stderr; and unless LOG_LEVEL asks for more, only
// warnings and errors are written, so a run of hundreds of model calls does
// not bury its own report.
export function configureCommandLineLogging(): void {
  stream = 'stderr';
  quietByDefault = true;
  root = undefined;
  children.clear();
}

// For tests: every logger then writes through this one. Pass nothing to undo.
export function replaceRootLogger(logger?: Logger): void {
  root = logger;
  children.clear();
}

// The logger for one part of the code, named so its lines can be told apart.
// Created on first use: the level and format come from the config.
export function getLogger(component: string): Logger {
  const existing = children.get(component);
  if (existing) return existing;
  root ??= createRootLogger();
  const child = root.child({ component });
  children.set(component, child);
  return child;
}
