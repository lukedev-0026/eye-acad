import path from 'node:path';

import { sha256OfFile } from '@/common/hash.server';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import { checkParsedNote } from '@/domain/note/note-checks';
import { formatNoteIndex } from '@/domain/note/note-index.format';
import { parseNoteXml } from '@/domain/note/note-parse';
import { searchText } from '@/domain/note/note-text';
import { NotePreparationError } from '@/domain/note/note.error';
import type { NoteIndex } from '@/domain/note/note.schema';
import { extractPdfXml } from '@/infrastructure/files/pdf-text.extractor';

export interface IngestedNote {
  readonly index: NoteIndex;
  // The index exactly as it should be written to disk.
  readonly text: string;
  readonly passages: number;
  readonly sentences: number;
  readonly pages: number;
  // Passages that run across a page break.
  readonly crossingPages: Array<string>;
  // False when the embeddings model could not be reached: the index then
  // supports keyword search only.
  readonly embedded: boolean;
}

// Prepares the reference note for search: reads the PDF, splits it into
// passages and sentences that each know their page, and adds an embedding to
// every passage. Nothing is written here.
export async function ingestNote(
  models: Pick<LanguageModelGateway, 'embed'>,
  options: { pdf: string; embeddingModel: string },
): Promise<IngestedNote> {
  const note = parseNoteXml(extractPdfXml(options.pdf));
  const problems = checkParsedNote(note);
  if (problems.length) throw new NotePreparationError(problems);

  const vectors = await models.embed(note.chunks.map(searchText), 'document');
  const dimensions = vectors?.[0]?.length;
  const index: NoteIndex = {
    source: {
      file: path.relative(process.cwd(), options.pdf),
      sha256: await sha256OfFile(options.pdf),
      pages: note.pages.length,
    },
    disclaimer: note.disclaimer,
    embedding: vectors && dimensions !== undefined ? { model: options.embeddingModel, dimensions } : null,
    chunks: note.chunks.map((chunk, i) => {
      const vector = vectors?.[i];
      return vector ? { ...chunk, vector } : chunk;
    }),
  };

  return {
    index,
    text: formatNoteIndex(index),
    passages: index.chunks.length,
    sentences: index.chunks.reduce((n, c) => n + c.sentences.length, 0),
    pages: note.pages.length,
    crossingPages: index.chunks.filter((c) => c.pages.length > 1).map((c) => c.id),
    embedded: index.embedding !== null,
  };
}
