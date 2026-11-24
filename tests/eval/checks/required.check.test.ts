import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RequiredRow } from '@/eval/checks/required-row.schema';
import { runRequiredChecks } from '@/eval/checks/required.check';
import { loadContext } from '@/eval/eval-context';
import type { EvalContext } from '@/eval/eval.types';
import type { ChatBody } from '@/eval/golden/golden';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';
import { scriptModel } from '@tests/fakes/scripted-model';
import type { ScriptedModel } from '@tests/fakes/scripted-model';

// The brief's three required checks, run with a model that behaves in a known
// way, to check the checks: do they pass what is right and fail what is wrong?

const userText = (request: ChatBody): string => request.messages.find((m) => m.role === 'user')?.content ?? '';
const systemText = (request: ChatBody): string => request.messages.find((m) => m.role === 'system')?.content ?? '';
const isSelector = (request: ChatBody): boolean => systemText(request).includes('routing step');
const isCoverage = (request: ChatBody): boolean => systemText(request).includes('item_0');
const isRevision = (request: ChatBody): boolean => userText(request).includes('Sentences from the reference note');

const pick = (item: string, eye: string) => ({
  intent: 'request_items',
  requests: [{ item, eye }],
  not_in_catalogue: false,
});
const NOT_ON_MENU = { intent: 'request_items', requests: [], not_in_catalogue: true };

// What a model that does its job says to each menu-picker question in the spec.
function goodSelection(request: ChatBody): object {
  const said = userText(request);
  if (said.includes('intraocular pressure in the right eye')) return pick('Intraocular pressure', 'right');
  if (said.includes('gonioscopy of the right eye')) return pick('Gonioscopy', 'right');
  if (said.includes('relative afferent pupillary defect'))
    return pick('Relative afferent pupillary defect', 'unspecified');
  return NOT_ON_MENU;
}

// Everything covered except the second key point, which is named as the gap.
const ALLERGY_GAP = {
  items: Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [`item_${i}`, { quote: '', status: i === 2 ? 'not_covered' : 'not_covered' }]),
  ),
  priority: 'item_2',
};

// The number the prompt gave to the sentence containing `phrase`.
function refOf(request: ChatBody, phrase: string): string | null {
  const line = userText(request)
    .split('\n')
    .find((text) => text.includes(phrase));
  return line ? (/^\[(\d+)\]/.exec(line)?.[1] ?? null) : null;
}

function citing(phrase: string) {
  return (request: ChatBody): object => {
    const ref = refOf(request, phrase);
    return ref
      ? {
          outcome: 'supported',
          sentence_refs: [ref],
          revision_point: 'Check for sulfonamide allergy before giving it.',
        }
      : { outcome: 'no_support', sentence_refs: [], revision_point: '' };
  };
}

const SUPPORTED = { reason: 'The passage says so.', verdict: 'supported' };

let model: ScriptedModel;
let ctx: EvalContext;

beforeAll(async () => {
  model = scriptModel();
  ctx = await loadContext();
});
afterAll(() => {
  model.restore();
});

async function run(only: Array<string>): Promise<Array<RequiredRow>> {
  const config = await loadStepsConfig('config/steps.start.json');
  return runRequiredChecks(ctx, config, 'test-run', only, () => Promise.resolve());
}
const passed = (rows: Array<RequiredRow>, name: string): string => {
  const mine = rows.filter((r) => r.name === name);
  return `${mine.filter((r) => r.pass).length} of ${mine.length}`;
};

describe('checks 1 and 2: asking for a finding', () => {
  it('pass a model that picks what was asked for, every time', async () => {
    model.willAnswer((request) => (isSelector(request) ? goodSelection(request) : {}));

    const rows = await run(['1', '2']);

    expect(passed(rows, 'available finding')).toBe('10 of 10');
    expect(passed(rows, 'unavailable finding')).toBe('10 of 10');
    expect(passed(rows, 'unavailable, with left-over text in its value field')).toBe('10 of 10');
    expect(passed(rows, 'not in the case at all')).toBe('10 of 10');
    expect(rows.find((r) => r.name === 'available finding')?.observed).toBe(
      'Shown: Right eye · Intraocular pressure: 58 mmHg (Goldmann applanation, 23:55) | Said: Right eye. Intraocular pressure: 58 millimetres of mercury. Method: Goldmann applanation, 23:55.',
    );
    expect(rows.find((r) => r.name === 'unavailable finding')?.observed).toContain(
      'Not available: No view: corneal oedema',
    );
  });

  it('take what should be said from the case file itself, not from the app', async () => {
    model.willAnswer((request) => goodSelection(request));

    const rows = await run(['1']);

    expect(rows[0]?.expected).toBe(
      'Shows and says: "Right eye", "58 mmHg", "Goldmann applanation, 23:55". Never: "Left eye", "18 mmHg". Reveals only iop_right',
    );
  });

  it('fail the other eye, both eyes at once, and a reply that cannot be used', async () => {
    model.willAnswer(() => pick('Intraocular pressure', 'left'));
    expect(passed(await run(['1']), 'available finding')).toBe('0 of 10');

    model.willAnswer(() => pick('Intraocular pressure', 'unspecified'));
    expect(passed(await run(['1']), 'available finding')).toBe('0 of 10');

    model.willAnswer(() => 'I cannot help with that.');
    const unusable = await run(['1']);
    expect(passed(unusable, 'available finding')).toBe('0 of 10');
    expect(unusable[0]?.observed).toBe('(schema_invalid)');
  });

  it('fail a model that offers the nearest thing when asked for something not in the case', async () => {
    model.willAnswer((request) =>
      userText(request).includes('central corneal thickness') ? pick('Cornea', 'unspecified') : goodSelection(request),
    );

    const rows = await run(['2']);

    expect(passed(rows, 'not in the case at all')).toBe('0 of 10');
    expect(passed(rows, 'unavailable finding')).toBe('10 of 10');
  });
});

describe('check 3: the citation, and saying when there is no support', () => {
  const answer = (cite: (request: ChatBody) => object) => (request: ChatBody) =>
    isCoverage(request) ? ALLERGY_GAP : isRevision(request) ? cite(request) : SUPPORTED;

  it('passes when the gap is the allergy and the page 6 sentence is quoted', async () => {
    model.willAnswer(answer(citing('Check for sulfonamide allergy')));

    const rows = await run(['3']);
    const citation = rows.filter((r) => r.name.startsWith('citation:'));

    expect(citation).toHaveLength(5);
    expect(citation.every((r) => r.pass)).toBe(true);
    expect(citation[0]?.cited?.page).toBe('p. 6');
    expect(citation[0]?.cited?.excerpt).toContain('Check for sulfonamide allergy');
    expect(citation[0]?.retrieved?.length).toBeGreaterThan(0);
  });

  it('fails when a sentence about a different condition is quoted, even though the check says supported', async () => {
    model.willAnswer(answer(citing('Avoid acetazolamide')));

    const rows = await run(['3']);
    const citation = rows.filter((r) => r.name.startsWith('citation:'));

    expect(citation.some((r) => r.pass)).toBe(false);
  });

  it('expects "no support" with no page and no quotation when the supporting passages are removed', async () => {
    // With the page 5-6 passage gone, a model that still finds something to quote fails the check.
    model.willAnswer(answer(citing('Avoid acetazolamide')));
    const quoting = (await run(['3'])).filter((r) => r.name === 'no support: the supporting passages removed');
    expect(quoting).toHaveLength(3);
    expect(quoting.some((r) => r.pass)).toBe(false);

    model.willAnswer(answer(() => ({ outcome: 'no_support', sentence_refs: [], revision_point: '' })));
    const declining = (await run(['3'])).filter((r) => r.name.startsWith('no support:'));
    expect(declining).toHaveLength(6);
    expect(declining.every((r) => r.pass)).toBe(true);
    expect(declining[0]?.observed).toContain('No page, no quotation.');
  });

  it('records a step that could not run as a failed run, saying why', async () => {
    model.willAnswer(() => 'not json');

    const rows = await run(['3']);
    const needsTheModel = rows.filter((r) => r.name !== 'no support: a key point the note does not cover');

    expect(needsTheModel).toHaveLength(8);
    expect(needsTheModel.every((r) => !r.pass)).toBe(true);
    expect(needsTheModel[0]?.observed).toMatch(/^Could not run: RevisionUnavailableError: coverage: schema_invalid/);
    expect(needsTheModel[7]?.observed).toMatch(/^Could not run: RevisionUnavailableError: revision: schema_invalid/);
  });

  it('needs no model to refuse a point that shares nothing with the note, when searching by keyword alone', async () => {
    model.willAnswer(() => 'not json');

    const invented = (await run(['3'])).filter((r) => r.name === 'no support: a key point the note does not cover');

    expect(invented).toHaveLength(3);
    expect(invented.every((r) => r.pass)).toBe(true);
    expect(model.requests().some((request) => userText(request).includes('MRI'))).toBe(false);
  });
});
