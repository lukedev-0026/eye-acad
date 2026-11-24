import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StepsConfig } from '@/domain/llm/step-settings.schema';
import { runChain } from '@/eval/checks/chain.check';
import { loadContext } from '@/eval/eval-context';
import type { EvalContext } from '@/eval/eval.types';
import type { ChatBody } from '@/eval/golden/golden';
import type { ChainRow } from '@/eval/run/result-row';
import { summarise } from '@/eval/run/summarise';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';
import { scriptModel } from '@tests/fakes/scripted-model';
import type { ScriptedModel } from '@tests/fakes/scripted-model';

// The revision step and the support check run together, with a model that
// behaves in a known way, to check the check: what it passes, what it counts
// as costly, and what it does with a run that could not finish.

const WRONG_SECTION = 'Avoid acetazolamide, which is itself a sulfonamide.';
const KEY_POINT = 'Note the sulfonamide allergy before giving acetazolamide';

const userText = (request: ChatBody): string => request.messages.find((m) => m.role === 'user')?.content ?? '';
const isRevision = (request: ChatBody): boolean => userText(request).includes('Sentences from the reference note');

const NO_SUPPORT = { outcome: 'no_support', sentence_refs: [], revision_point: '' };
const verdict = (supported: boolean): object => ({
  reason: 'As scripted.',
  verdict: supported ? 'supported' : 'not_supported',
});

// A revision step that quotes the sentence from the wrong section whenever it
// is on offer, and repeats it as its advice.
function quotingTheWrongSection(request: ChatBody): object {
  const line = userText(request)
    .split('\n')
    .find((text) => text.includes(WRONG_SECTION));
  const ref = line ? /^\[(\d+)\]/.exec(line)?.[1] : undefined;
  return ref ? { outcome: 'supported', sentence_refs: [ref], revision_point: WRONG_SECTION } : NO_SUPPORT;
}

let model: ScriptedModel;
let ctx: EvalContext;
let chosen: StepsConfig;
let improved: StepsConfig;

beforeAll(async () => {
  model = scriptModel();
  ctx = await loadContext();
  chosen = await loadStepsConfig('config/steps.chosen.json');
  improved = await loadStepsConfig('config/steps.improved.json');
});
afterAll(() => {
  model.restore();
});

async function run(config: StepsConfig): Promise<Array<ChainRow>> {
  return runChain(ctx, config, {
    runId: 'test-run',
    stage: 'check',
    split: 'tune',
    trials: 1,
    label: 'test',
    onRow: () => Promise.resolve(),
  });
}
const rowFor = (rows: Array<ChainRow>, caseId: string): ChainRow | undefined => rows.find((r) => r.caseId === caseId);

describe('the revision step and the support check, run together', () => {
  it('passes "no support" where the note cannot back the point, and fails it where the note can', async () => {
    model.willReply(NO_SUPPORT);

    const rows = await run(chosen);

    expect(rows).toHaveLength(8);
    expect(rowFor(rows, 'rev-kp1-removed')).toMatchObject({ pass: true, costly: false });
    expect(rowFor(rows, 'rev-invented-canthotomy')).toMatchObject({ pass: true, costly: false });
    expect(rowFor(rows, 'rev-kp1')).toMatchObject({
      pass: false,
      costly: false,
      detail: 'told no support for a point the note does back (revision step said so)',
    });
    expect(summarise(rows)).toMatchObject({ cases: 8, casesAllPass: 4, costly: 0 });
  });

  it('counts a quotation from the wrong section, accepted by the support check, as costly', async () => {
    model.willAnswer((request) => (isRevision(request) ? quotingTheWrongSection(request) : verdict(true)));

    const row = rowFor(await run(chosen), 'rev-kp1-removed');

    expect(row).toMatchObject({ pass: false, costly: true, outcome: 'ok' });
    expect(row?.detail).toBe(`shown p. 8: "${WRONG_SECTION}" with the advice "${WRONG_SECTION}"`);
  });

  it('with the improvement on, the same quotation is checked against the key point and refused', async () => {
    // The support check agrees the quotation backs the advice (they are the
    // same words). Asked about the key point itself, it does not.
    model.willAnswer((request) => {
      if (isRevision(request)) return quotingTheWrongSection(request);
      return verdict(!userText(request).includes(KEY_POINT));
    });

    const withoutIt = rowFor(await run(chosen), 'rev-kp1-removed');
    const withIt = rowFor(await run(improved), 'rev-kp1-removed');

    expect(withoutIt).toMatchObject({ pass: false, costly: true });
    expect(withIt).toMatchObject({
      pass: true,
      costly: false,
      detail: 'told no support (by the check against the key point)',
    });
  });

  it('counts a run whose model reply was unusable as a failed run, and names the step', async () => {
    model.willReply('This is not the JSON that was asked for.');

    const rows = await run(chosen);

    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row).toMatchObject({ outcome: 'schema_invalid', pass: false, costly: false });
      expect(row.detail).toBe('the revision step did not finish (schema_invalid): the trainee is asked to try again');
    }
    // Counted, not left out as if the machine had failed.
    expect(summarise(rows)).toMatchObject({ cases: 8, casesAllPass: 0, trialsCounted: 8, schemaInvalid: 8 });
  });
});
