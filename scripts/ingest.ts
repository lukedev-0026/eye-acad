// Prepares the reference note for search and writes data/note-index.json.
//   pnpm ingest [path/to/note.pdf]
// Needs poppler (`pdftohtml`). Re-running on an unchanged PDF with the same
// embeddings model should leave the committed index byte-for-byte the same.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ingestNote } from '@/application/note/ingest-note.use-case';
import { getConfig } from '@/config/env.server';
import { runCli } from '@/eval/cli';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

await runCli(async () => {
  const config = getConfig();
  const pdf = path.resolve(process.argv[2] ?? config.files.notePdf);
  const note = await ingestNote(createLanguageModelGateway(config), {
    pdf,
    embeddingModel: config.embeddings.model,
  });

  if (!note.embedded) {
    console.warn(`Could not reach the embeddings model (${config.embeddings.model}). Writing a keyword-only index.`);
  }
  await writeFile(config.files.noteIndex, note.text);

  const embedding = note.index.embedding;
  console.log(
    `${note.passages} passages, ${note.sentences} sentences, ${note.pages} pages. ` +
      `Crossing a page break: ${note.crossingPages.join(', ') || 'none'}. ` +
      `Embeddings: ${embedding ? `${embedding.model} (${embedding.dimensions})` : 'none'}.`,
  );
});
