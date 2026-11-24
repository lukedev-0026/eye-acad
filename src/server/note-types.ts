// The prepared, searchable copy of the reference note (data/note-index.json).

export type NoteSentence = {
  // Stable id within the index, in reading order: "s1", "s2", ...
  id: string;
  text: string;
  // The printed page(s) the sentence sits on. Two entries when it runs across
  // a page break.
  pages: Array<number>;
  // For a table cell: the name of its column.
  column?: string;
};

export type NoteChunk = {
  id: string;
  kind: 'paragraph' | 'bullet' | 'table_row';
  // Section heading, then sub-heading.
  headings: Array<string>;
  // A bold label that opens a bullet ("Pilocarpine."), or a table row's name.
  leadIn: string | null;
  text: string;
  pages: Array<number>;
  sentences: Array<NoteSentence>;
  // Embedding of headings + lead-in + text. Absent if ingest ran without the
  // embeddings model.
  vector?: Array<number>;
};

export type NoteIndex = {
  source: { file: string; sha256: string; pages: number };
  // The note's own statement about what it is, shown on the revision card.
  disclaimer: string;
  embedding: { model: string; dimensions: number } | null;
  chunks: Array<NoteChunk>;
};

// "p. 6" or "pp. 5–6"
export function pageLabel(pages: Array<number>): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return `p. ${sorted[0]}`;
  return `pp. ${sorted[0]}–${sorted[sorted.length - 1]}`;
}

export function headingPath(chunk: NoteChunk): string {
  return chunk.headings.join(' › ');
}

// Everything about a chunk that search should see.
export function searchText(chunk: NoteChunk): string {
  return [chunk.headings.join('. '), chunk.leadIn ?? '', chunk.text].filter(Boolean).join('. ');
}
