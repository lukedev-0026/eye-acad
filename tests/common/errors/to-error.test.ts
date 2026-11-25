import { describe, expect, it } from 'vitest';

import { InternalError } from '@/common/errors/internal.error';
import {
  describeError,
  errorMessage,
  toAppError,
  toError,
} from '@/common/errors/to-error';
import { ValidationError } from '@/common/errors/validation.error';

describe('toError', () => {
  it('returns an error unchanged', () => {
    const error = new RangeError('out of range');

    expect(toError(error)).toBe(error);
  });

  it('wraps a thrown string, keeping it as the message', () => {
    const error = toError('plain text');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('plain text');
  });

  it('wraps any other thrown value and keeps it as the cause', () => {
    const thrown = { status: 503 };
    const error = toError(thrown);

    expect(error.message).toBe('Non-error thrown: {"status":503}');
    expect(error.cause).toBe(thrown);
  });

  it('copes with a value that cannot be turned into JSON', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => toError(circular)).not.toThrow();
  });
});

describe('errorMessage and describeError', () => {
  it('give the message alone, or the kind and the message', () => {
    const error = new TypeError('fetch failed');

    expect(errorMessage(error)).toBe('fetch failed');
    expect(describeError(error)).toBe('TypeError: fetch failed');
  });

  it('describe an error exactly as String() would, so saved records read the same', () => {
    const error = new TypeError('fetch failed');

    expect(describeError(error)).toBe(String(error));
  });

  it('accept a value that is not an error', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(describeError(42)).toBe('42');
  });
});

describe('toAppError', () => {
  it('passes one of our own errors through', () => {
    const error = new ValidationError('Too long.');

    expect(toAppError(error)).toBe(error);
  });

  it('wraps anything else as an internal error with the original as its cause', () => {
    const original = new TypeError('undefined is not a function');
    const error = toAppError(original);

    expect(error).toBeInstanceOf(InternalError);
    expect(error.cause).toBe(original);
    expect(error.message).not.toContain('undefined is not a function');
  });
});
