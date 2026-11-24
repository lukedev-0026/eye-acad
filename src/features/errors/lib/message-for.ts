import { PublicError } from '@/common/errors/public.error';

// The words to show when a call to the server fails. Where the server knows
// the reason and wrote a message for the trainee ("An answer has already been
// given for this attempt."), that is shown. Otherwise the screen's own wording
// for the action is: it says what to do next.
export function messageFor(error: unknown, fallback: string): string {
  return error instanceof PublicError && error.specific ? error.message : fallback;
}
