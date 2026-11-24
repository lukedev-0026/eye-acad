import { z } from 'zod';

// The prepared, searchable copy of the reference note (data/note-index.json).
// The file is read through these schemas, so a hand-edited or damaged index is
// refused, not half-used.

export const NoteSentenceSchema = z.object({
  // Stable id within the index, in reading order: "s1", "s2", ...
  id: z.string(),
  text: z.string(),
  // The printed page(s) the sentence sits on. Two entries when it runs across
  // a page break.
  pages: z.array(z.number()),
  // For a table cell: the name of its column.
  column: z.string().optional(),
});
export type NoteSentence = z.infer<typeof NoteSentenceSchema>;

export const NoteChunkSchema = z.object({
  id: z.string(),
  kind: z.enum(['paragraph', 'bullet', 'table_row']),
  // Section heading, then sub-heading.
  headings: z.array(z.string()),
  // A bold label that opens a bullet ("Pilocarpine."), or a table row's name.
  leadIn: z.string().nullable(),
  text: z.string(),
  pages: z.array(z.number()),
  sentences: z.array(NoteSentenceSchema),
  // Embedding of headings + lead-in + text. Absent if ingest ran without the
  // embeddings model.
  vector: z.array(z.number()).optional(),
});
export type NoteChunk = z.infer<typeof NoteChunkSchema>;

export const NoteIndexSchema = z.object({
  source: z.object({ file: z.string(), sha256: z.string(), pages: z.number() }),
  // The note's own statement about what it is, shown on the revision card.
  disclaimer: z.string(),
  embedding: z.object({ model: z.string(), dimensions: z.number() }).nullable(),
  chunks: z.array(NoteChunkSchema),
});
export type NoteIndex = z.infer<typeof NoteIndexSchema>;
