import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHECK_REQUESTED_ITEM,
  runSelector,
} from '@/application/steps/selector.step';
import type { PublicCase } from '@/domain/case/case.schema';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { loadCase } from '@/infrastructure/files/case-file.loader';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';
import { scriptModel } from '@tests/fakes/scripted-model';
import type { ScriptedModel } from '@tests/fakes/scripted-model';
import { testDeps } from '@tests/fakes/test-deps';

const pickCornea = {
  intent: 'request_items',
  requests: [{ item: 'Cornea', eye: 'right' }],
  not_in_catalogue: false,
};

let model: ScriptedModel;
let publicCase: PublicCase;
let off: StepSettings;
let on: StepSettings;

beforeAll(async () => {
  model = scriptModel();
  publicCase = await loadCase();
  off = (await loadStepsConfig('config/steps.start.json')).steps.selector;
  on = { ...off, improvements: [CHECK_REQUESTED_ITEM] };
});
afterAll(() => {
  model.restore();
});

const ask = (settings: StepSettings) =>
  runSelector(
    testDeps().models,
    publicCase,
    'What is the corneal thickness in the right eye?',
    [],
    settings,
  );

describe('the second look at a pick (check-requested-item)', () => {
  it('is not asked when the improvement is off: the near match is revealed, in one call', async () => {
    model.willReply(pickCornea);
    const run = await ask(off);
    expect(run.check).toBeUndefined();
    expect(run.decision?.kind).toBe('reveal');
    expect(model.requests()).toHaveLength(1);
  });

  it('turns a near match into "not recorded" when the check says it was not asked for', async () => {
    model.willReply(pickCornea, {
      checks: [{ item: 'Cornea', asked_for: false }],
    });
    const run = await ask(on);
    expect(model.requests()).toHaveLength(2);
    expect(run.decision?.kind).toBe('not_recorded');
  });

  it('keeps the pick when the check agrees', async () => {
    model.willReply(pickCornea, {
      checks: [{ item: 'cornea', asked_for: true }],
    });
    const run = await ask(on);
    expect(run.decision?.kind).toBe('reveal');
  });

  it('keeps the first choice when the check gives no usable reply', async () => {
    model.willReply(pickCornea, 'not json');
    const run = await ask(on);
    expect(run.check?.outcome).not.toBe('ok');
    expect(run.decision?.kind).toBe('reveal');
  });

  it('is not asked when nothing was picked', async () => {
    model.willReply({
      intent: 'request_items',
      requests: [],
      not_in_catalogue: true,
    });
    const run = await ask(on);
    expect(run.check).toBeUndefined();
    expect(run.decision?.kind).toBe('not_recorded');
    expect(model.requests()).toHaveLength(1);
  });
});
