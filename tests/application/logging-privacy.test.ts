import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  handleAnswer,
  handleFollowUpReply,
} from '@/application/answer/answer.use-case';
import { startAttempt } from '@/application/attempt/start-attempt.use-case';
import { handleRequest } from '@/application/turn/turn.use-case';
import {
  createLogger,
  replaceRootLogger,
} from '@/common/logging/logger.server';
import { scriptModel } from '@tests/fakes/scripted-model';
import type { ScriptedModel } from '@tests/fakes/scripted-model';
import { testDeps } from '@tests/fakes/test-deps';

const UID = 'trainee-a';
const REQUEST =
  'Could you tell me the intraocular pressure in the right eye please';
const ANSWER =
  "It's acute glaucoma in the right eye, so I'd lower the pressure with drops.";
const REPLY =
  'Because the iris is ischaemic at that pressure and the sphincter cannot respond.';
const NOTES = (
  JSON.parse(readFileSync('data/case-EA-VIVA-001.json', 'utf8')) as {
    examiner_notes: {
      diagnosis: string;
      key_points: Array<string>;
      follow_up_ideas: Array<string>;
    };
  }
).examiner_notes;

let model: ScriptedModel;
const lines: Array<string> = [];

beforeAll(() => {
  vi.stubEnv('VIVA_STEPS_FILE', 'config/steps.start.json');
  model = scriptModel();
  replaceRootLogger(
    createLogger({
      level: 'trace',
      format: 'json',
      destination: { write: (line: string) => void lines.push(line) },
    }),
  );
});
afterAll(() => {
  replaceRootLogger();
  model.restore();
  vi.unstubAllEnvs();
});

describe('what is logged during an attempt', () => {
  it('says what happened at each stage, and never what was said or what the hidden answers are', async () => {
    const deps = testDeps();
    const attemptId = await startAttempt(deps, UID);

    model.willReply({
      intent: 'request_items',
      requests: [{ item: 'Intraocular pressure', eye: 'right' }],
      not_in_catalogue: false,
    });
    await handleRequest(deps, UID, attemptId, { text: REQUEST });

    const question =
      'Why might pilocarpine not work at first when the pressure is very high?';
    model.willReply({
      idea: 'idea_3',
      anchor_quote: 'lower the pressure with drops',
      question,
    });
    await handleAnswer(deps, UID, attemptId, ANSWER, 'typed');

    model.willReply(
      {
        items: Object.fromEntries(
          Array.from({ length: 7 }, (_, i) => [
            `item_${i}`,
            { quote: '', status: 'not_covered' },
          ]),
        ),
        priority: 'item_2',
      },
      {
        outcome: 'supported',
        sentence_refs: ['1'],
        revision_point: 'Check for allergy first.',
      },
      { reason: 'The passage says so.', verdict: 'supported' },
    );
    const card = await handleFollowUpReply(
      deps,
      UID,
      attemptId,
      REPLY,
      'typed',
    );

    const log = lines.join('');
    const events = lines.map(
      (line) => (JSON.parse(line) as { msg: string }).msg,
    );

    expect(events).toEqual(
      expect.arrayContaining([
        'startAttempt.created',
        'handleRequest.completed',
        'ensureFollowUp.asked',
        'prepareRevision.completed',
        'callStep.completed',
      ]),
    );
    for (const step of [
      'selector',
      'followup',
      'coverage',
      'revision',
      'verifier',
    ]) {
      expect(log).toContain(`"step":"${step}"`);
    }

    for (const said of [REQUEST, ANSWER, REPLY, 'acute glaucoma', 'ischaemic'])
      expect(log).not.toContain(said);
    for (const shown of [
      '58 mmHg',
      'fifty-eight',
      question,
      card.excerpt ?? 'none',
      card.point ?? 'none',
    ]) {
      expect(log).not.toContain(shown);
    }
    for (const hidden of [
      NOTES.diagnosis,
      ...NOTES.key_points,
      ...NOTES.follow_up_ideas,
    ]) {
      expect(log).not.toContain(hidden);
    }
  });
});
