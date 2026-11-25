import type { ParsedNote } from './note-parse';

const LONGEST_REAL_WORD = 25;

export function checkParsedNote(note: ParsedNote): Array<string> {
  const problems: Array<string> = [];
  for (const p of note.pages) {
    if (p.footerNumber !== p.number) {
      problems.push(
        `page ${p.number}: printed page number is ${p.footerNumber ?? 'missing'}`,
      );
    }
  }
  for (const c of note.chunks) {
    if (c.sentences.length === 0) problems.push(`${c.id}: no sentences`);
    for (const s of c.sentences) {
      if (!s.text.trim()) problems.push(`${c.id}/${s.id}: empty sentence`);
      if (s.pages.length === 0) problems.push(`${c.id}/${s.id}: no page`);
      const long = s.text
        .split(/[\s/–-]+/)
        .find((w) => w.length > LONGEST_REAL_WORD);
      if (long)
        problems.push(`${c.id}/${s.id}: words run together ("${long}")`);
    }
  }
  for (const p of note.pages) {
    if (!note.chunks.some((c) => c.pages.includes(p.number)))
      problems.push(`page ${p.number}: no passages`);
  }
  return problems;
}
