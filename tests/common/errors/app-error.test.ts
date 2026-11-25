import { describe, expect, it } from 'vitest';

import { AppError, serialiseError } from '@/common/errors/app.error';
import { UnauthenticatedError } from '@/common/errors/auth.error';
import { ERROR_CODES, isErrorCode } from '@/common/errors/error-codes';
import {
  ExternalServiceError,
  ModelProviderError,
} from '@/common/errors/external-service.error';
import { InternalError } from '@/common/errors/internal.error';
import { ValidationError } from '@/common/errors/validation.error';

describe('AppError', () => {
  it('keeps what was caught as the cause, whole', () => {
    const network = new TypeError('fetch failed');
    const error = new ModelProviderError(
      'ollama',
      'The model could not be reached.',
      { cause: network },
    );

    expect(error.cause).toBe(network);
    expect(error.rootCause).toBe(network);
  });

  it('finds the first failure under several wrappings', () => {
    const first = new Error('connection refused');
    const second = new ModelProviderError('ollama', 'unreachable', {
      cause: first,
    });
    const third = new InternalError({ cause: second });

    expect(third.rootCause).toBe(first);
  });

  it('is its own root cause when nothing was caught', () => {
    const error = new ValidationError('Too long.');

    expect(error.cause).toBeUndefined();
    expect(error.rootCause).toBe(error);
  });

  it('is an instance of every class above it', () => {
    const error = new ModelProviderError('ollama', 'unreachable');

    expect(error).toBeInstanceOf(ModelProviderError);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('names itself with a fixed name, not the class name the bundler may shorten', () => {
    expect(new ModelProviderError('ollama', 'x').name).toBe(
      'ModelProviderError',
    );
    expect(new UnauthenticatedError().name).toBe('UnauthenticatedError');
    expect(new InternalError().name).toBe('InternalError');
  });

  it('carries a string code, an HTTP status, and whether its message may be shown', () => {
    const unauthenticated = new UnauthenticatedError();
    const internal = new InternalError({ cause: new Error('secret detail') });

    expect([
      unauthenticated.code,
      unauthenticated.status,
      unauthenticated.expose,
    ]).toEqual(['UNAUTHENTICATED', 401, true]);
    expect([internal.code, internal.status, internal.expose]).toEqual([
      'INTERNAL',
      500,
      false,
    ]);
    expect(internal.message).not.toContain('secret detail');
  });

  it('records which service failed in its details', () => {
    const error = new ModelProviderError('anthropic', 'HTTP 529', {
      details: { model: 'm' },
    });

    expect(error.service).toBe('anthropic');
    expect(error.details).toEqual({ service: 'anthropic', model: 'm' });
  });

  it('turns into plain data with the whole chain of causes', () => {
    const error = new InternalError({
      cause: new ModelProviderError('ollama', 'unreachable', {
        cause: new TypeError('fetch failed'),
      }),
    });

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: 'InternalError',
      message: 'An unexpected error occurred.',
      code: 'INTERNAL',
      cause: {
        name: 'ModelProviderError',
        message: 'unreachable',
        code: 'MODEL_PROVIDER_FAILED',
        details: { service: 'ollama' },
        cause: { name: 'TypeError', message: 'fetch failed' },
      },
    });
  });

  it('serialises a thrown value that is not an error', () => {
    expect(serialiseError('just a string')).toEqual({
      name: 'NonError',
      message: 'just a string',
    });
    expect(serialiseError({ reason: 1 })).toEqual({
      name: 'NonError',
      message: '{"reason":1}',
    });
  });

  it('stops following a chain of causes that loops', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;

    expect(() => serialiseError(a)).not.toThrow();
    expect(() => new InternalError({ cause: a }).rootCause).not.toThrow();
  });
});

describe('error codes', () => {
  it('are unique strings', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(ERROR_CODES.every((code) => typeof code === 'string')).toBe(true);
  });

  it('can be told from other values', () => {
    expect(isErrorCode('ATTEMPT_NOT_FOUND')).toBe(true);
    expect(isErrorCode('NOT_A_CODE')).toBe(false);
    expect(isErrorCode(404)).toBe(false);
  });
});
