import { z } from 'zod';

import { REQUEST_EYES } from '@/domain/examiner/selector.schema';

// The saved attempt, exactly as the trainee's browser may read it. The server
// passes every write through this schema, and zod drops any field not listed
// here, so nothing can reach the browser by being added to an object by
// mistake. Hidden working (what was judged missing, search details, raw model
// output) lives in a separate server-only record.

export const PHASES = ['asking', 'follow_up', 'revising', 'complete'] as const;
export type Phase = (typeof PHASES)[number];

export const RevealedItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['finding', 'history']),
  eyeLabel: z.string(),
  label: z.string(),
  value: z.string(),
  method: z.string().nullable(),
  available: z.boolean(),
  display: z.string(),
  // When it was first revealed. The wording is a snapshot: a later edit to the
  // case file does not rewrite an old attempt.
  atMs: z.number(),
});
export type RevealedItem = z.infer<typeof RevealedItemSchema>;

export const TurnSchema = z.object({
  n: z.number().int(),
  atMs: z.number(),
  speaker: z.enum(['trainee', 'examiner']),
  text: z.string(),
  via: z.enum(['typed', 'voice']).optional(),
  kind: z.string().optional(),
  itemIds: z.array(z.string()).optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const RequestSchema = z.object({ item: z.string(), eye: z.enum(REQUEST_EYES) });

export const FollowUpSchema = z.object({
  question: z.string(),
  // The trainee's own words the question responds to, when there are any.
  respondingTo: z.string().nullable(),
  path: z.enum(['written', 'supplied', 'fixed']),
  atMs: z.number(),
});

export const RevisionCardSchema = z.object({
  outcome: z.enum(['supported', 'no_support']),
  // In the trainee's terms: what the answer left out, or that nothing was.
  missed: z.string().nullable(),
  point: z.string().nullable(),
  pointSource: z.enum(['written', 'supplied']).nullable(),
  page: z.string().nullable(),
  heading: z.string().nullable(),
  excerpt: z.string().nullable(),
  retrievedPages: z.array(z.number()),
  retrievalMode: z.enum(['hybrid', 'keyword_only']),
  message: z.string().nullable(),
  // The reference note's own statement of what it is.
  noteLine: z.string().nullable().default(null),
  atMs: z.number(),
});
export type RevisionCard = z.infer<typeof RevisionCardSchema>;

export const TimingSchema = z.object({
  turn: z.number().int(),
  via: z.enum(['typed', 'voice']),
  speechToTextMs: z.number().nullable(),
  modelMs: z.number().nullable(),
  textToSpeechMs: z.number().nullable(),
  serverTotalMs: z.number(),
});

export const PublicAttemptSchema = z.object({
  caseId: z.string(),
  caseTitle: z.string(),
  caseFileHash: z.string(),
  phase: z.enum(PHASES),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  turns: z.array(TurnSchema),
  revealed: z.array(RevealedItemSchema),
  lastRequests: z.array(RequestSchema),
  answer: z.object({ text: z.string(), atMs: z.number() }).nullable(),
  followUp: FollowUpSchema.nullable(),
  followUpReply: z.object({ text: z.string(), atMs: z.number() }).nullable(),
  revision: RevisionCardSchema.nullable(),
  timings: z.array(TimingSchema),
});
export type PublicAttempt = z.infer<typeof PublicAttemptSchema>;
