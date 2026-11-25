import { z } from 'zod';

import { REQUEST_EYES } from '@/domain/examiner/selector.schema';

// zod drops unlisted fields on write, so nothing leaks to the browser.

const PHASES = ['asking', 'follow_up', 'revising', 'complete'] as const;
export type Phase = (typeof PHASES)[number];

const RevealedItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['finding', 'history']),
  eyeLabel: z.string(),
  label: z.string(),
  value: z.string(),
  method: z.string().nullable(),
  available: z.boolean(),
  display: z.string(),
  atMs: z.number(),
});
export type RevealedItem = z.infer<typeof RevealedItemSchema>;

const TurnSchema = z.object({
  n: z.number().int(),
  atMs: z.number(),
  speaker: z.enum(['trainee', 'examiner']),
  text: z.string(),
  via: z.enum(['typed', 'voice']).optional(),
  kind: z.string().optional(),
  itemIds: z.array(z.string()).optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

const RequestSchema = z.object({ item: z.string(), eye: z.enum(REQUEST_EYES) });

const FollowUpSchema = z.object({
  question: z.string(),
  respondingTo: z.string().nullable(),
  path: z.enum(['written', 'supplied', 'fixed']),
  atMs: z.number(),
});

const RevisionCardSchema = z.object({
  outcome: z.enum(['supported', 'no_support']),
  // What the answer left out, in the trainee's terms; null if nothing.
  missed: z.string().nullable(),
  point: z.string().nullable(),
  pointSource: z.enum(['written', 'supplied']).nullable(),
  page: z.string().nullable(),
  heading: z.string().nullable(),
  excerpt: z.string().nullable(),
  retrievedPages: z.array(z.number()),
  retrievalMode: z.enum(['hybrid', 'keyword_only']),
  message: z.string().nullable(),
  noteLine: z.string().nullable().default(null),
  atMs: z.number(),
});
export type RevisionCard = z.infer<typeof RevisionCardSchema>;

const TimingSchema = z.object({
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
