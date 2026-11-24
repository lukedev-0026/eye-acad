import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '@/config/env.server';
import type { NoteIndex } from '@/domain/note/note.types';

export const NOTE_PDF = () => path.resolve(process.cwd(), process.env.VIVA_NOTE_PDF ?? 'data/reference-note.pdf');
export const NOTE_INDEX = () => path.resolve(process.cwd(), process.env.VIVA_NOTE_INDEX ?? 'data/note-index.json');

export class StaleIndexError extends Error {}

export async function sha256OfFile(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

// Loads the prepared note and refuses to use it if the PDF has changed since.
// Quoting old text against a new document would be worse than stopping.
export async function loadNoteIndex(): Promise<NoteIndex> {
  let index: NoteIndex;
  try {
    index = JSON.parse(await readFile(NOTE_INDEX(), 'utf8')) as NoteIndex;
  } catch {
    throw new StaleIndexError('The reference note has not been prepared. Run: pnpm ingest');
  }
  const current = await sha256OfFile(NOTE_PDF());
  if (index.source.sha256 !== current) {
    throw new StaleIndexError('The reference note PDF has changed since it was prepared. Run: pnpm ingest');
  }
  const embeddingModel = getConfig().embeddings.model;
  if (index.embedding && index.embedding.model !== embeddingModel) {
    throw new StaleIndexError(
      `The note was prepared with ${index.embedding.model} but the app is set to ${embeddingModel}. Run: pnpm ingest`,
    );
  }
  return index;
}
