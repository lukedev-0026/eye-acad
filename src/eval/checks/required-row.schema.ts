import { z } from 'zod';

export const RequiredRowSchema = z.object({
  type: z.literal('required'),
  runId: z.string(),
  at: z.string(),
  check: z.string(),
  name: z.string(),
  trial: z.number().int(),
  input: z.string(),
  expected: z.string(),
  observed: z.string(),
  pass: z.boolean(),
  ms: z.number(),
  model: z.string(),
  retrieved: z
    .array(
      z.object({
        passage: z.string(),
        pages: z.string(),
        keywordRank: z.number(),
        meaningRank: z.number().nullable(),
        cosine: z.number().nullable(),
      }),
    )
    .optional(),
  cited: z
    .object({
      page: z.string().nullable(),
      excerpt: z.string().nullable(),
      heading: z.string().nullable(),
    })
    .optional(),
});
export type RequiredRow = z.infer<typeof RequiredRowSchema>;
