import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CaseFileSchema } from '@/domain/case/case.schema';
import type { PublicCase } from '@/domain/case/case.schema';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import { LINES } from '@/domain/examiner/lines';
import { decide, replyFor } from '@/domain/examiner/policy';
import {
  normaliseSelectorOutput,
  selectorSchema,
} from '@/domain/examiner/selector.schema';
import type { SelectorOutput } from '@/domain/examiner/selector.schema';

const data = CaseFileSchema.parse(
  JSON.parse(readFileSync('data/case-EA-VIVA-001.json', 'utf8')),
);
const c: PublicCase = {
  caseId: data.case_id,
  title: data.title,
  openingPrompt: data.opening_prompt,
  patient: data.patient,
  findings: data.findings,
  fileHash: 'test',
};
const catalogue = buildCatalogue(c);

const pick = (
  requests: SelectorOutput['requests'],
  over: Partial<SelectorOutput> = {},
): SelectorOutput => ({
  intent: 'request_items',
  requests,
  not_in_catalogue: false,
  ...over,
});

const ids = (out: SelectorOutput) => {
  const d = decide(c, catalogue, out);
  return d.kind === 'reveal' ? d.items.map((i) => i.id) : d.kind;
};

describe('catalogue', () => {
  it('lists names only: no values, methods or examiner notes', () => {
    const text = JSON.stringify(catalogue);
    for (const f of c.findings) {
      if (f.value !== null) expect(text).not.toContain(String(f.value));
    }
    expect(text).not.toContain(data.examiner_notes.diagnosis);
    for (const k of data.examiner_notes.key_points)
      expect(text).not.toContain(k);
  });
  it('has one entry per finding label and one per history field', () => {
    const labels = new Set(c.findings.map((f) => f.label));
    expect(catalogue.items.filter((i) => i.kind === 'finding')).toHaveLength(
      labels.size,
    );
    expect(catalogue.items.filter((i) => i.kind === 'history')).toHaveLength(
      Object.keys(c.patient).length,
    );
  });
});

describe('eye handling', () => {
  it('a named eye returns that eye only', () => {
    expect(ids(pick([{ item: 'Intraocular pressure', eye: 'right' }]))).toEqual(
      ['iop_right'],
    );
    expect(ids(pick([{ item: 'Intraocular pressure', eye: 'left' }]))).toEqual([
      'iop_left',
    ]);
  });
  it('no eye named returns both, and never guesses', () => {
    expect(
      ids(pick([{ item: 'Intraocular pressure', eye: 'unspecified' }])),
    ).toEqual(['iop_right', 'iop_left']);
    expect(ids(pick([{ item: 'Intraocular pressure', eye: 'both' }]))).toEqual([
      'iop_right',
      'iop_left',
    ]);
  });
  it('a row recorded for both eyes answers a request for either', () => {
    expect(ids(pick([{ item: 'Refraction', eye: 'left' }]))).toEqual([
      'refraction',
    ]);
  });
  it('a row with no eye answers whatever eye was named', () => {
    expect(ids(pick([{ item: 'Blood pressure', eye: 'right' }]))).toEqual([
      'bp',
    ]);
  });
  it('asking for the right eye never brings the left eye with it', () => {
    const d = decide(
      c,
      catalogue,
      pick([{ item: 'Gonioscopy', eye: 'right' }]),
    );
    expect(d.kind).toBe('reveal');
    const reply = replyFor(d);
    expect(reply.lines).toEqual([
      'Right eye · Gonioscopy: Not available: No view: corneal oedema',
    ]);
    expect(reply.speech).not.toMatch(/left/i);
  });
});

describe('what the examiner does', () => {
  it('says so when the thing asked for is not in the case, and reveals nothing', () => {
    const reply = replyFor(
      decide(c, catalogue, pick([], { not_in_catalogue: true })),
    );
    expect(reply.lines).toEqual([LINES.notRecorded]);
    expect(reply.items).toEqual([]);
  });
  it('reveals what exists and says something else was not recorded', () => {
    const reply = replyFor(
      decide(
        c,
        catalogue,
        pick([{ item: 'Cornea', eye: 'right' }], { not_in_catalogue: true }),
      ),
    );
    expect(reply.items.map((i) => i.id)).toEqual(['cornea_right']);
    expect(reply.lines.at(-1)).toBe(LINES.alsoNotRecorded);
  });
  it('refuses a request for everything at once', () => {
    const all = catalogue.items.map((i) => ({
      item: i.name,
      eye: 'unspecified' as const,
    }));
    expect(ids(pick(all))).toBe('too_many');
  });
  it('points at the button when the trainee starts to answer', () => {
    const reply = replyFor(
      decide(
        c,
        catalogue,
        pick([{ item: 'Cornea', eye: 'right' }], { intent: 'wants_to_answer' }),
      ),
    );
    expect(reply.lines).toEqual([LINES.pressTheButton]);
    expect(reply.items).toEqual([]);
  });
  it('returns history in the case file wording', () => {
    const reply = replyFor(
      decide(c, catalogue, pick([{ item: 'Allergies', eye: 'unspecified' }])),
    );
    expect(reply.lines).toEqual([`Allergies: ${String(c.patient.allergies)}`]);
  });
  it('speaks one sentence group per item, and exactly the words of the whole reply', () => {
    const reply = replyFor(
      decide(
        c,
        catalogue,
        pick([{ item: 'Pupil', eye: 'unspecified' }], {
          not_in_catalogue: true,
        }),
      ),
    );
    expect(reply.speechParts).toHaveLength(3);
    expect(reply.speechParts.join(' ')).toBe(reply.speech);
    expect(reply.speechParts[0]?.startsWith('Right eye. Pupil:')).toBe(true);
    expect(reply.speechParts[2]).toBe(LINES.alsoNotRecorded);
  });
  it('keeps case-file order whatever order was asked', () => {
    expect(
      ids(
        pick([
          { item: 'Cornea', eye: 'left' },
          { item: 'Visual acuity', eye: 'left' },
        ]),
      ),
    ).toEqual(['va_left', 'cornea_left']);
  });
});

describe('selector output check', () => {
  const schema = selectorSchema(catalogue);
  const tidy = normaliseSelectorOutput(catalogue);

  it('rejects a label that is not on the list', () => {
    const out = {
      intent: 'request_items',
      requests: [{ item: 'Diagnosis', eye: 'right' }],
      not_in_catalogue: false,
    };
    expect(schema.safeParse(out).success).toBe(false);
  });
  it('after tidying, an unknown label reveals nothing and counts as not recorded', () => {
    const out = tidy({
      intent: 'request_items',
      requests: [{ item: 'Diagnosis', eye: 'right' }],
      not_in_catalogue: false,
    });
    const parsed = schema.parse(out);
    expect(parsed.requests).toEqual([]);
    expect(parsed.not_in_catalogue).toBe(true);
  });
  it('matches labels and eyes without regard to capitals', () => {
    const parsed = schema.parse(
      tidy({
        intent: 'Request_Items',
        requests: [{ item: 'intraocular PRESSURE', eye: 'Right' }],
        not_in_catalogue: false,
      }),
    );
    expect(parsed.requests).toEqual([
      { item: 'Intraocular pressure', eye: 'right' },
    ]);
  });
  it('rejects anything that is not the expected shape', () => {
    expect(
      schema.safeParse(tidy('the diagnosis is angle closure')).success,
    ).toBe(false);
    expect(
      schema.safeParse(
        tidy({
          intent: 'reveal_everything',
          requests: [],
          not_in_catalogue: false,
        }),
      ).success,
    ).toBe(false);
  });
});
