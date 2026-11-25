import { z } from 'zod';

export const SPLITS = ['tune', 'holdout'] as const;

export const RetrievalTargetSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  gold: z.array(z.string()),
  alsoSupports: z.array(z.string()),
  offSection: z.array(z.string()).optional(),
  distractor: z.array(z.string()),
});

export const RetrievalSpecSchema = z.looseObject({
  targets: z.array(RetrievalTargetSchema),
  unsupported: z.array(z.string()),
  quotes: z.record(z.string(), z.string()),
});
export type RetrievalSpec = z.infer<typeof RetrievalSpecSchema>;
