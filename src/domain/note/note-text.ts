import type { NoteChunk } from './note.schema';

/** "p. 6" or "pp. 5–6" */
export function pageLabel(pages: ReadonlyArray<number>): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return '';
  return first === last ? `p. ${first}` : `pp. ${first}–${last}`;
}

export function headingPath(chunk: Pick<NoteChunk, 'headings'>): string {
  return chunk.headings.join(' › ');
}

export function searchText(
  chunk: Pick<NoteChunk, 'headings' | 'leadIn' | 'text'>,
): string {
  return [chunk.headings.join('. '), chunk.leadIn ?? '', chunk.text]
    .filter(Boolean)
    .join('. ');
}
