import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { getConfig } from '@/config/env.server';
import { NoteIndexMissingError, NoteIndexStaleError } from '@/domain/note/note.error';
import type { NoteIndex } from '@/domain/note/note.types';

export async function sha256OfFile(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

// Loads the prepared note and refuses to use it if the PDF has changed since.
// Quoting old text against a new document would be worse than stopping.
export async function loadNoteIndex(): Promise<NoteIndex> {
  const { files, embeddings } = getConfig();
  let index: NoteIndex;
  try {
    index = JSON.parse(await readFile(files.noteIndex, 'utf8')) as NoteIndex;
  } catch (error) {
    throw new NoteIndexMissingError({ cause: error, details: { file: files.noteIndex } });
  }
  const current = await sha256OfFile(files.notePdf);
  if (index.source.sha256 !== current) {
    throw new NoteIndexStaleError('The reference note PDF has changed since it was prepared. Run: pnpm ingest', {
      details: { preparedFrom: index.source.sha256, now: current },
    });
  }
  if (index.embedding && index.embedding.model !== embeddings.model) {
    throw new NoteIndexStaleError(
      `The note was prepared with ${index.embedding.model} but the app is set to ${embeddings.model}. Run: pnpm ingest`,
    );
  }
  return index;
}
