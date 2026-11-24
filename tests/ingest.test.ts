import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { pageLabel } from '../src/server/note-types';
import type { NoteIndex } from '../src/server/note-types';
import { Bm25, retrieve, stem, tokenize } from '../src/server/retrieve';

const index = JSON.parse(readFileSync('data/note-index.json', 'utf8')) as NoteIndex;
const pdfHash = createHash('sha256').update(readFileSync('data/reference-note.pdf')).digest('hex');
// These expectations describe the PDF supplied with the task. If the PDF is
// replaced they no longer apply, and are skipped with a clear reason.
const SUPPLIED_PDF = 'aadeb55dce02f2e3131d9ab077e8dce271a2e295b69686de18e6121fbfa5ffaa';
const supplied = pdfHash === SUPPLIED_PDF;

const sentence = (phrase: string) => {
  for (const c of index.chunks) {
    const s = c.sentences.find((x) => x.text.includes(phrase));
    if (s) return { chunk: c, sentence: s };
  }
  throw new Error(`not found: ${phrase}`);
};

describe('the prepared note', () => {
  it('was prepared from the PDF that is in the repo now', () => {
    expect(index.source.sha256).toBe(pdfHash);
  });
  it('gives every sentence a page and some text', () => {
    for (const c of index.chunks) {
      expect(c.sentences.length).toBeGreaterThan(0);
      for (const s of c.sentences) {
        expect(s.text.trim().length).toBeGreaterThan(0);
        expect(s.pages.length).toBeGreaterThan(0);
      }
    }
  });
  it('leaves out the running header, footer, the "about" box and the sources list', () => {
    const all = JSON.stringify(index.chunks.map((c) => [c.headings, c.text]));
    expect(all).not.toContain('Take-home reference note');
    expect(all).not.toContain('Eye Academy reference note');
    // The body text mentions Kanski once; the sources list cites the edition.
    expect(all).not.toMatch(/Clinical Ophthalmology, 10th ed/);
    expect(all).not.toMatch(/accessed November 2026/);
    expect(index.chunks.some((c) => c.headings.includes('Sources'))).toBe(false);
  });
});

describe.skipIf(!supplied)('the supplied PDF', () => {
  it('keeps the one bullet that runs across a page break in one piece', () => {
    const crossing = index.chunks.filter((c) => c.pages.length > 1);
    expect(crossing).toHaveLength(1);
    expect(crossing[0].leadIn).toBe('Systemic carbonic anhydrase inhibitor.');
    expect(crossing[0].pages).toEqual([5, 6]);
  });
  it('puts the allergy warning on page 6, in the same passage as the drug named on page 5', () => {
    const { chunk, sentence: s } = sentence('Check for sulfonamide allergy');
    expect(s.text).toBe(
      'Check for sulfonamide allergy, kidney disease, low potassium and sickle cell disease before giving it.',
    );
    expect(pageLabel(s.pages)).toBe('p. 6');
    expect(chunk.sentences[0].text.startsWith('Acetazolamide 500 mg')).toBe(true);
    expect(pageLabel(chunk.sentences[0].pages)).toBe('pp. 5–6');
  });
  it('does not join the similar-looking break between pages 3 and 4', () => {
    const { chunk } = sentence('Blurred vision and coloured haloes around lights');
    expect(chunk.pages).toEqual([3]);
    expect(sentence('Nausea, vomiting and sometimes abdominal pain').chunk.pages).toEqual([4]);
  });
  it('keeps table rows, with each cell quotable and its column named', () => {
    const { chunk, sentence: s } = sentence('sulfonamide allergy, kidney disease, sickle cell disease');
    expect(chunk.kind).toBe('table_row');
    expect(chunk.leadIn).toBe('Systemic carbonic anhydrase inhibitors');
    expect(s.column).toBe('Key cautions');
    expect(chunk.headings).toEqual(['IOP-lowering medicines']);
  });
  it('treats a bold opening as a label only when it ends a sentence', () => {
    expect(sentence('Pilocarpine 2% constricts the pupil').chunk.leadIn).toBe('Pilocarpine.');
    const flowing = sentence('Hyperosmotic agents if the pressure stays high').chunk;
    expect(flowing.leadIn).toBeNull();
  });
});

describe('search', () => {
  it('matches capitals and plurals on both sides', () => {
    expect(tokenize('IOP')).toEqual(tokenize('iop'));
    expect(stem('iridotomies')).toBe(stem('iridotomy'));
    expect(stem('pressures')).toBe('pressure');
    expect(stem('glaucomatous')).toBe('glaucomatous');
  });
  it('scores a document that shares rare words above one that does not', () => {
    const bm25 = new Bm25([tokenize('acetazolamide and sulfonamide allergy'), tokenize('the pupil is fixed')]);
    const [a, b] = bm25.scores(tokenize('sulfonamide allergy'));
    expect(a).toBeGreaterThan(b);
    expect(b).toBe(0);
  });
  it.skipIf(!supplied)('finds the page 5-6 passage first for the allergy key point, by keywords alone', () => {
    const run = retrieve(index, { target: 'Note the sulfonamide allergy before giving acetazolamide' });
    expect(run.mode).toBe('keyword_only');
    expect(run.results[0].chunk.leadIn).toBe('Systemic carbonic anhydrase inhibitor.');
  });
  it('can leave a passage out, for the "no support" tests', () => {
    const first = retrieve(index, { target: 'Note the sulfonamide allergy before giving acetazolamide' }).results[0]
      .chunk.id;
    const without = retrieve(
      index,
      { target: 'Note the sulfonamide allergy before giving acetazolamide' },
      { exclude: [first] },
    );
    expect(without.results.some((r) => r.chunk.id === first)).toBe(false);
  });
});
