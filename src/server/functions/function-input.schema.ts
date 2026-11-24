import { z } from 'zod';

import { ValidationError } from '@/common/errors/validation.error';

// What the browser may send to each server function, with its limits.

const attemptId = z.string().min(1).max(64);

export const AttemptInput = z.object({ attemptId });

export const AskInput = z.object({
  attemptId,
  text: z.string().max(2000),
});

// Roughly 2.4 MB of audio once decoded: ample for a 90-second answer.
export const AudioInput = z.object({
  attemptId,
  audioBase64: z.string().min(1).max(3_300_000),
  mimeType: z.string().max(100),
});

export const TextInput = z.object({
  attemptId,
  text: z.string().max(8000),
  via: z.enum(['typed', 'voice']).default('typed'),
});

// Checks a request against its schema. A request that does not fit raises a
// ValidationError, which the browser receives as INVALID_INPUT, in place of
// the framework's own bare Error carrying a list of issues as its message.
export function validated<S extends z.ZodType>(schema: S) {
  return (input: z.input<S>): z.output<S> => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('The request was not in the expected form.', {
        cause: parsed.error,
        details: { issues: z.prettifyError(parsed.error) },
      });
    }
    return parsed.data;
  };
}
