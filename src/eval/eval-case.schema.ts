import { z } from 'zod';

// The files the checks are scored against, as they are read from disk.

export const SPLITS = ['tune', 'holdout'] as const;

// A point the note should (or should not) back, with the sentences that
// settle it. Sentences are named by a phrase they contain.
export const RetrievalTargetSchema = z.object({
  id: z.string().min(1),
  // "examiner_notes.key_points[1]", read from the live case file, or "text:…".
  source: z.string().min(1),
  gold: z.array(z.string()),
  alsoSupports: z.array(z.string()),
  offSection: z.array(z.string()).optional(),
  distractor: z.array(z.string()),
});

export const RetrievalSpecSchema = z.looseObject({
  targets: z.array(RetrievalTargetSchema),
  // Invented key points the note does not cover.
  unsupported: z.array(z.string()),
  // A plausible phrase from a trainee's answer for each target.
  quotes: z.record(z.string(), z.string()),
});
export type RetrievalSpec = z.infer<typeof RetrievalSpecSchema>;
