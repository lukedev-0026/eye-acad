import { z } from 'zod';

const NoteSentenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  pages: z.array(z.number()),
  column: z.string().optional(),
});
export type NoteSentence = z.infer<typeof NoteSentenceSchema>;

const NoteChunkSchema = z.object({
  id: z.string(),
  kind: z.enum(['paragraph', 'bullet', 'table_row']),
  headings: z.array(z.string()),
  leadIn: z.string().nullable(),
  text: z.string(),
  pages: z.array(z.number()),
  sentences: z.array(NoteSentenceSchema),
  // Absent when ingest ran without the embeddings model.
  vector: z.array(z.number()).optional(),
});
export type NoteChunk = z.infer<typeof NoteChunkSchema>;

export const NoteIndexSchema = z.object({
  source: z.object({ file: z.string(), sha256: z.string(), pages: z.number() }),
  disclaimer: z.string(),
  embedding: z.object({ model: z.string(), dimensions: z.number() }).nullable(),
  chunks: z.array(NoteChunkSchema),
});
export type NoteIndex = z.infer<typeof NoteIndexSchema>;
