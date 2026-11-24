import { describe, expect, it } from 'vitest';

import { publicErrorAdapter } from '@/common/errors/public-error.adapter';
import { PublicError } from '@/common/errors/public.error';

const fields = { code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found.', status: 404, requestId: 'req-1' } as const;

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
    const received = publicErrorAdapter.fromSerializable(JSON.parse(JSON.stringify(sent)) as typeof sent);

    expect(received).toBeInstanceOf(PublicError);
    expect(received.toFields()).toEqual(fields);
  });
});
