import { describe, expect, it } from 'vitest';

import { ModelProviderError } from '@/common/errors/external-service.error';
import { InternalError } from '@/common/errors/internal.error';
import { publicErrorAdapter } from '@/common/errors/public-error.adapter';
import {
  GENERIC_PUBLIC_MESSAGE,
  PublicError,
  toPublicError,
} from '@/common/errors/public.error';
import { AttemptPhaseError } from '@/domain/attempt/attempt.error';
import { messageFor } from '@/features/errors/lib/message-for';

const fields = {
  code: 'ATTEMPT_NOT_FOUND',
  message: 'Attempt not found.',
  specific: true,
  status: 404,
  requestId: 'req-1',
} as const;

describe('PublicError', () => {
  it('carries a code, a safe message, a status and the request id, and never a cause', () => {
    const error = new PublicError(fields);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PublicError');
    expect(error.toFields()).toEqual(fields);
    expect(error.cause).toBeUndefined();
  });
});

describe('the adapter that carries it to the browser', () => {
  it('recognises a PublicError and nothing else', () => {
    expect(publicErrorAdapter.test(new PublicError(fields))).toBe(true);
    expect(publicErrorAdapter.test(new Error('other'))).toBe(false);
    expect(publicErrorAdapter.test({ ...fields })).toBe(false);
  });

  it('rebuilds an equal PublicError on the other side', () => {
    const sent = publicErrorAdapter.toSerializable(new PublicError(fields));
    const received = publicErrorAdapter.fromSerializable(
      JSON.parse(JSON.stringify(sent)) as typeof sent,
    );

    expect(received).toBeInstanceOf(PublicError);
    expect(received.toFields()).toEqual(fields);
  });
});

describe('what the browser is told about an error', () => {
  it('is the message itself when it was written for the trainee', () => {
    const error = toPublicError(
      new AttemptPhaseError(
        'An answer has already been given for this attempt.',
      ),
      'req-7',
    );

    expect(error.toFields()).toEqual({
      code: 'ATTEMPT_WRONG_PHASE',
      message: 'An answer has already been given for this attempt.',
      specific: true,
      status: 409,
      requestId: 'req-7',
    });
  });

  it('is a generic message for anything else, with nothing of the cause, the details or the stack', () => {
    const secret = new ModelProviderError(
      'ollama',
      'connect ECONNREFUSED 127.0.0.1:11434',
      {
        cause: new TypeError('fetch failed'),
        details: { model: 'qwen3.5:9b' },
      },
    );
    const sent = JSON.stringify(
      publicErrorAdapter.toSerializable(
        toPublicError(new InternalError({ cause: secret }), 'req-8'),
      ),
    );

    expect(JSON.parse(sent)).toEqual({
      code: 'INTERNAL',
      message: GENERIC_PUBLIC_MESSAGE,
      specific: false,
      status: 500,
      requestId: 'req-8',
    });
    for (const leak of [
      'ECONNREFUSED',
      'fetch failed',
      'qwen3.5',
      'ollama',
      'stack',
    ])
      expect(sent).not.toContain(leak);
  });

  it('keeps the status of an outside service that failed, and still says nothing about it', () => {
    const error = toPublicError(
      new ModelProviderError('ollama', 'unreachable'),
      'req-9',
    );

    expect(error).toMatchObject({
      code: 'MODEL_PROVIDER_FAILED',
      status: 502,
      specific: false,
    });
    expect(error.message).toBe(GENERIC_PUBLIC_MESSAGE);
  });
});

describe('the words the screen shows for a failed call', () => {
  const fallback = 'Your answer was not saved. Please try again.';

  it("are the server's, when it wrote them for the trainee", () => {
    const error = toPublicError(
      new AttemptPhaseError(
        'An answer has already been given for this attempt.',
      ),
      'r',
    );

    expect(messageFor(error, fallback)).toBe(
      'An answer has already been given for this attempt.',
    );
  });

  it("are the screen's own for anything else: a generic failure, a network error, a thrown string", () => {
    expect(messageFor(toPublicError(new InternalError(), 'r'), fallback)).toBe(
      fallback,
    );
    expect(messageFor(new TypeError('Failed to fetch'), fallback)).toBe(
      fallback,
    );
    expect(messageFor('boom', fallback)).toBe(fallback);
  });
});
