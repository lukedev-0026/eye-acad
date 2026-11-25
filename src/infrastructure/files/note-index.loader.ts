import { readFile } from 'node:fs/promises';

import { sha256OfFile } from '@/common/hash.server';
import { getConfig } from '@/config/env.server';
import {
  NoteIndexMissingError,
  NoteIndexStaleError,
} from '@/domain/note/note.error';
import { NoteIndexSchema } from '@/domain/note/note.schema';
import type { NoteIndex } from '@/domain/note/note.schema';

function parseNoteIndex(text: string, file: string): NoteIndex {
  try {
    return NoteIndexSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new NoteIndexStaleError(
      'The prepared reference note is not in the expected form. Run: pnpm ingest',
      {
        cause: error,
        details: { file },
      },
    );
  }
}

/** Refuses a stale index: quoting a changed PDF is worse than stopping. */
export async function loadNoteIndex(): Promise<NoteIndex> {
  const { files, embeddings } = getConfig();
  let text: string;
  try {
    text = await readFile(files.noteIndex, 'utf8');
  } catch (error) {
    throw new NoteIndexMissingError({
      cause: error,
      details: { file: files.noteIndex },
    });
  }
  const index = parseNoteIndex(text, files.noteIndex);
  const current = await sha256OfFile(files.notePdf);
  if (index.source.sha256 !== current) {
    throw new NoteIndexStaleError(
      'The reference note PDF has changed since it was prepared. Run: pnpm ingest',
      {
        details: { preparedFrom: index.source.sha256, now: current },
      },
    );
  }
  if (index.embedding && index.embedding.model !== embeddings.model) {
    throw new NoteIndexStaleError(
      `The note was prepared with ${index.embedding.model} but the app is set to ${embeddings.model}. Run: pnpm ingest`,
    );
  }
  return index;
}
