import type { NoteIndex } from './note.schema';

// The prepared note as it is written to disk: one passage per line, which
// keeps the file readable and a change to it small. Preparing the same PDF
// again with the same embeddings model gives the same bytes.
export function formatNoteIndex(index: NoteIndex): string {
  const body = index.chunks.map((c) => `    ${JSON.stringify(c)}`).join(',\n');
  const { chunks: _chunks, ...head } = index;
  return `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "chunks": [\n${body}\n  ]\n}\n`;
}
