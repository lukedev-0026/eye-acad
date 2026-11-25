import type { NoteIndex } from './note.schema';

export function formatNoteIndex(index: NoteIndex): string {
  const body = index.chunks.map((c) => `    ${JSON.stringify(c)}`).join(',\n');
  const { chunks: _chunks, ...head } = index;
  return `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "chunks": [\n${body}\n  ]\n}\n`;
}
