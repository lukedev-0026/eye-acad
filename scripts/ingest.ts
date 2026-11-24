// Prepares the reference note for search and writes data/note-index.json.
//   pnpm ingest [path/to/note.pdf]
// Needs poppler (`pdftohtml`). Re-running on an unchanged PDF with the same
// embeddings model should leave the committed index byte-for-byte the same.
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { sha256OfFile } from '@/common/hash.server';
import { configureCommandLineLogging } from '@/common/logging/logger.server';
import { getConfig } from '@/config/env.server';
import { parseNoteXml } from '@/domain/note/note-parse';
import { searchText } from '@/domain/note/note.types';
import type { NoteChunk, NoteIndex } from '@/domain/note/note.types';
import { createLanguageModelGateway } from '@/infrastructure/llm/language-model.gateway';

configureCommandLineLogging();

const { files } = getConfig();
const pdf = path.resolve(process.argv[2] ?? files.notePdf);
// Arguments are passed as a list, never through a shell.
const xml = execFileSync('pdftohtml', ['-xml', '-i', '-stdout', pdf], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const note = parseNoteXml(xml);

// Checks that do not depend on what the note says.
const problems: Array<string> = [];
for (const p of note.pages) {
  if (p.footerNumber !== p.number) {
    problems.push(`page ${p.number}: printed page number is ${p.footerNumber ?? 'missing'}`);
  }
}
for (const c of note.chunks) {
  if (c.sentences.length === 0) problems.push(`${c.id}: no sentences`);
  for (const s of c.sentences) {
    if (!s.text.trim()) problems.push(`${c.id}/${s.id}: empty sentence`);
    if (s.pages.length === 0) problems.push(`${c.id}/${s.id}: no page`);
    const long = s.text.split(/[\s/–-]+/).find((w) => w.length > 25);
    if (long) problems.push(`${c.id}/${s.id}: words run together ("${long}")`);
  }
}
for (const p of note.pages) {
  if (!note.chunks.some((c) => c.pages.includes(p.number))) problems.push(`page ${p.number}: no passages`);
}
if (problems.length) {
  console.error(`The note did not parse cleanly:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const embeddingModel = getConfig().embeddings.model;
const vectors = await createLanguageModelGateway(getConfig()).embed(
  note.chunks.map((c) => searchText(c as NoteChunk)),
  'document',
);
if (!vectors) {
  console.warn(`Could not reach the embeddings model (${embeddingModel}). Writing a keyword-only index.`);
}

const index: NoteIndex = {
  source: {
    file: path.relative(process.cwd(), pdf),
    sha256: await sha256OfFile(pdf),
    pages: note.pages.length,
  },
  disclaimer: note.disclaimer,
  embedding: vectors ? { model: embeddingModel, dimensions: vectors[0].length } : null,
  chunks: note.chunks.map((c, i) => (vectors ? { ...c, vector: vectors[i] } : c)),
};

// One passage per line keeps the file readable and the diff small.
const body = index.chunks.map((c) => `    ${JSON.stringify(c)}`).join(',\n');
const { chunks: _chunks, ...head } = index;
const text = `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "chunks": [\n${body}\n  ]\n}\n`;
await writeFile(files.noteIndex, text);

const sentences = index.chunks.reduce((n, c) => n + c.sentences.length, 0);
const crossPage = index.chunks.filter((c) => c.pages.length > 1).map((c) => c.id);
console.log(
  `${index.chunks.length} passages, ${sentences} sentences, ${note.pages.length} pages. ` +
    `Crossing a page break: ${crossPage.join(', ') || 'none'}. ` +
    `Embeddings: ${index.embedding ? `${index.embedding.model} (${index.embedding.dimensions})` : 'none'}.`,
);
