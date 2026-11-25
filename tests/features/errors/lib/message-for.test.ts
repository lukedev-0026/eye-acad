import { describe, expect, it } from 'vitest';

import { PublicError } from '@/common/errors/public.error';
import { messageFor } from '@/features/errors/lib/message-for';

const FALLBACK = 'Your answer was not saved. Please try again.';

const publicError = (specific: boolean, message: string): PublicError =>
  new PublicError({
    code: 'ATTEMPT_WRONG_PHASE',
    message,
    specific,
    status: 409,
    requestId: 'req-1',
  });

describe('the words shown when a call to the server fails', () => {
  it("shows the server's message when it was written for the trainee", () => {
    const error = publicError(
      true,
      'An answer has already been given for this attempt.',
    );

    expect(messageFor(error, FALLBACK)).toBe(
      'An answer has already been given for this attempt.',
    );
  });

  it("keeps the screen's own wording when the server only said that something went wrong", () => {
    expect(
      messageFor(
        publicError(false, 'Something went wrong. Please try again.'),
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("keeps the screen's own wording for anything that is not from the server", () => {
    expect(messageFor(new TypeError('Failed to fetch'), FALLBACK)).toBe(
      FALLBACK,
    );
    expect(messageFor('a string was thrown', FALLBACK)).toBe(FALLBACK);
    expect(messageFor(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
