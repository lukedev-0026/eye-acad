import { describe, expect, it } from 'vitest';

import { ModelProviderError } from '@/common/errors/external-service.error';
import { InternalError } from '@/common/errors/internal.error';
import { createLogger } from '@/common/logging/logger.server';
import {
  annotateRequestContext,
  currentRequestContext,
  runWithRequestContext,
} from '@/common/logging/request-context.server';
import type { LogLevel } from '@/config/env.schema';
import { Secret } from '@/config/secret';

type Line = Record<string, unknown>;

// A logger that writes into an array, so a test can read what was written.
function capture(level: LogLevel = 'debug') {
  const lines: Array<Line> = [];
  const logger = createLogger({
    level,
    format: 'json',
    destination: { write: (text: string) => void lines.push(JSON.parse(text) as Line) },
  });
  return { logger, lines };
}

describe('the logger', () => {
  it('writes one JSON object per line: level as a word, an ISO time, the facts, the message', () => {
    const { logger, lines } = capture();

    logger.info({ actionResult: 'SUCCESS', step: 'selector', durationMs: 412 }, 'callStep.completed');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      actionResult: 'SUCCESS',
      step: 'selector',
      durationMs: 412,
      msg: 'callStep.completed',
    });
    expect(lines[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(lines[0]).not.toHaveProperty('pid');
    expect(lines[0]).not.toHaveProperty('hostname');
  });

  it('names the part of the code a line came from', () => {
    const { logger, lines } = capture();

    logger.child({ component: 'ollama' }).warn('chat.timedOut');

    expect(lines[0]).toMatchObject({ component: 'ollama', level: 'warn' });
  });

  it('writes nothing below its level', () => {
    const { logger, lines } = capture('warn');

    logger.info('ignored');
    logger.warn('kept');

    expect(lines.map((line) => line.msg)).toEqual(['kept']);
  });

  it('logs an error with its code, its details and the whole chain of causes', () => {
    const { logger, lines } = capture();
    const error = new InternalError({
      cause: new ModelProviderError('ollama', 'The model could not be reached.', {
        cause: new TypeError('fetch failed'),
        details: { model: 'qwen3.5:9b' },
      }),
    });

    logger.error({ err: error }, 'askForFindings.failed');

    const err = lines[0]?.err as { type: string; code: string; stack: string; cause: Line & { cause: Line } };
    expect(err.type).toBe('InternalError');
    expect(err.code).toBe('INTERNAL');
    expect(err.stack).toContain('InternalError');
    expect(err.cause).toMatchObject({
      type: 'ModelProviderError',
      code: 'MODEL_PROVIDER_FAILED',
      service: 'ollama',
      details: { service: 'ollama', model: 'qwen3.5:9b' },
    });
    expect(err.cause.cause).toMatchObject({ type: 'TypeError', message: 'fetch failed' });
  });

  it('replaces a token, key, password or recording that reaches a line', () => {
    const { logger, lines } = capture();

    logger.info(
      {
        authorization: 'Bearer abc',
        headers: { authorization: 'Bearer abc' },
        request: { headers: { authorization: 'Bearer abc' }, audioBase64: 'AAAA', token: 't' },
        deepgram: { apiKey: 'dg-secret' },
        account: { password: 'demo-password' },
      },
      'request.received',
    );

    const text = JSON.stringify(lines[0]);
    for (const secret of ['Bearer abc', 'AAAA', 'dg-secret', 'demo-password', '"t"']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[REDACTED]');
  });

  it('cannot print a wrapped secret even where no path is listed for it', () => {
    const { logger, lines } = capture();

    logger.info({ somewhere: { unexpected: new Secret('dg-secret') } }, 'config.loaded');

    expect(JSON.stringify(lines[0])).not.toContain('dg-secret');
  });
});

describe('the request context', () => {
  it('puts the request id on every line written while the request is served', async () => {
    const { logger, lines } = capture();

    await runWithRequestContext({ requestId: 'req-42' }, async () => {
      logger.info('first');
      await Promise.resolve();
      annotateRequestContext({ uid: 'user-1', attemptId: 'attempt-9' });
      logger.info('second');
    });
    logger.info('outside');

    expect(lines[0]).toMatchObject({ requestId: 'req-42', msg: 'first' });
    expect(lines[1]).toMatchObject({ requestId: 'req-42', uid: 'user-1', attemptId: 'attempt-9', msg: 'second' });
    expect(lines[2]).not.toHaveProperty('requestId');
  });

  it('keeps two requests apart when they overlap', async () => {
    const seen: Array<string | undefined> = [];
    const serve = (requestId: string, delayMs: number) =>
      runWithRequestContext({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        seen.push(currentRequestContext()?.requestId);
      });

    await Promise.all([serve('slow', 20), serve('fast', 1)]);

    expect(seen).toEqual(['fast', 'slow']);
  });

  it('does nothing when asked to add to a context that is not open', () => {
    expect(() => {
      annotateRequestContext({ uid: 'nobody' });
    }).not.toThrow();
    expect(currentRequestContext()).toBeUndefined();
  });
});
