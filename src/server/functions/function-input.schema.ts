import { z } from 'zod';

import { ValidationError } from '@/common/errors/validation.error';

const attemptId = z.string().min(1).max(64);

export const AttemptInput = z.object({ attemptId });

export const AskInput = z.object({
  attemptId,
  text: z.string().max(2000),
});

/** About 2.4 MB of audio once decoded: ample for a 90-second answer. */
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

/** Throws ValidationError (INVALID_INPUT in the browser), not a bare Error. */
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
