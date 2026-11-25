import { describe, expect, it } from 'vitest';

import {
  caseMarkers,
  findLeaks,
  serverOnlyMarkers,
} from '@/eval/checks/leak-scan';

const CASE = {
  case_id: 'T-1',
  findings: [
    {
      id: 'iop_right',
      label: 'Intraocular pressure',
      value: 58,
      unit: 'mmHg',
      available: true,
    },
  ],
  examiner_notes: {
    diagnosis: 'Right acute primary angle closure',
    key_points: ['Note the "sulfonamide" allergy'],
  },
};

describe('caseMarkers', () => {
  it('takes every piece of text long enough to be unmistakable, with where it is', () => {
    expect(caseMarkers(CASE)).toEqual([
      { text: 'Intraocular pressure', from: 'case file.findings[0].label' },
      {
        text: 'Right acute primary angle closure',
        from: 'case file.examiner_notes.diagnosis',
      },
      {
        text: 'Note the "sulfonamide" allergy',
        from: 'case file.examiner_notes.key_points[0]',
      },
    ]);
  });

  it('leaves out short text, numbers and flags, which could be in any program', () => {
    const texts = caseMarkers(CASE).map((marker) => marker.text);
    expect(texts).not.toContain('mmHg');
    expect(texts).not.toContain('T-1');
    expect(texts).not.toContain('iop_right');
  });
});

describe('findLeaks', () => {
  const markers = caseMarkers(CASE);

  it('finds nothing in files that hold none of the text', () => {
    expect(
      findLeaks(
        [{ file: 'a.js', text: 'const label = "Your turn";' }],
        markers,
      ),
    ).toEqual([]);
  });

  it('names the file and the text when a file holds some of it', () => {
    const leaks = findLeaks(
      [
        { file: 'a.js', text: 'const a = 1;' },
        {
          file: 'b.js',
          text: 'const d = "Right acute primary angle closure";',
        },
      ],
      markers,
    );
    expect(leaks).toEqual([
      {
        file: 'b.js',
        marker: {
          text: 'Right acute primary angle closure',
          from: 'case file.examiner_notes.diagnosis',
        },
      },
    ]);
  });

  it('finds text a bundler has written with its quotes escaped', () => {
    const leaks = findLeaks(
      [
        {
          file: 'c.js',
          text: String.raw`k="Note the \"sulfonamide\" allergy"`,
        },
      ],
      markers,
    );
    expect(leaks.map((leak) => leak.marker.from)).toEqual([
      'case file.examiner_notes.key_points[0]',
    ]);
  });

  it('finds server-only code by name', () => {
    const leaks = findLeaks(
      [{ file: 'd.js', text: 'import("firebase-admin/auth")' }],
      serverOnlyMarkers(),
    );
    expect(leaks.map((leak) => leak.marker.text)).toEqual(['firebase-admin']);
  });
});
