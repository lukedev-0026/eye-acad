import { readFileSync } from 'node:fs';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ensureFollowUp,
  handleAnswer,
  handleFollowUpReply,
  prepareRevision,
} from '@/application/answer/answer.use-case';
import { startAttempt } from '@/application/attempt/start-attempt.use-case';
import { RevisionUnavailableError } from '@/application/revision/revision.error';
import {
  AttemptPhaseError,
  EmptyAnswerError,
} from '@/domain/attempt/attempt.error';
import { LINES } from '@/domain/examiner/lines';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { InMemoryAttemptRepository } from '@tests/fakes/in-memory-attempt.repository';
import { NOT_JSON, scriptModel } from '@tests/fakes/scripted-model';
import type { ScriptedModel } from '@tests/fakes/scripted-model';
import { testDeps } from '@tests/fakes/test-deps';
import type { TestDeps } from '@tests/fakes/test-deps';

const UID = 'trainee-a';
const ANSWER =
  "It's acute glaucoma in the right eye, so I'd lower the pressure with drops.";

const NOTES = (
  JSON.parse(readFileSync('data/case-EA-VIVA-001.json', 'utf8')) as {
    examiner_notes: {
      follow_up_ideas: Array<string>;
      key_points: Array<string>;
    };
  }
).examiner_notes;
const NOTE_TEXT = readFileSync('data/note-index.json', 'utf8');

const GOOD_FOLLOW_UP = {
  idea: 'idea_3',
  anchor_quote: 'lower the pressure with drops',
  question:
    'Why might pilocarpine not work at first when the pressure is very high?',
};
const LEAKY_FOLLOW_UP = {
  idea: 'idea_1',
  anchor_quote: 'lower the pressure with drops',
  question:
    'Since this is acute primary angle closure, should the sulfonamide allergy stop you giving acetazolamide?',
};

const NOTHING_COVERED = {
  items: Object.fromEntries(
    ['item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_6'].map(
      (id) => [id, { quote: '', status: 'not_covered' }],
    ),
  ),
  priority: 'item_2',
};
const CITE_FIRST_SENTENCE = {
  outcome: 'supported',
  sentence_refs: ['1'],
  revision_point: 'Check for allergy first.',
};
const SUPPORTED = { reason: 'The passage says so.', verdict: 'supported' };
const NOT_SUPPORTED = {
  reason: 'The passage is about something else.',
  verdict: 'not_supported',
};

let model: ScriptedModel;
let deps: TestDeps;
let attempts: InMemoryAttemptRepository;
let attemptId: string;

beforeAll(() => {
  vi.stubEnv('VIVA_STEPS_FILE', 'config/steps.start.json');
  model = scriptModel();
});
afterAll(() => {
  model.restore();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  deps = testDeps();
  attempts = deps.attempts;
  attemptId = await startAttempt(deps, UID);
});

const kinds = async () =>
  (await attempts.read(UID, attemptId)).turns.map((t) => t.kind ?? null);

describe('giving the answer', () => {
  it('is refused when empty, and the attempt stays open for questions', async () => {
    await expect(
      handleAnswer(deps, UID, attemptId, '   ', 'typed'),
    ).rejects.toBeInstanceOf(EmptyAnswerError);
    expect((await attempts.read(UID, attemptId)).phase).toBe('asking');
  });

  it('records the answer and asks one follow-up that responds to what was said', async () => {
    model.willReply(GOOD_FOLLOW_UP);

    const followUp = await handleAnswer(
      deps,
      UID,
      attemptId,
      `  ${ANSWER}  `,
      'typed',
    );
    const attempt = await attempts.read(UID, attemptId);

    expect(followUp).toEqual({
      question: GOOD_FOLLOW_UP.question,
      speech: GOOD_FOLLOW_UP.question,
      respondingTo: 'lower the pressure with drops',
      path: 'written',
    });
    expect(attempt.phase).toBe('follow_up');
    expect(attempt.answer?.text).toBe(ANSWER);
    expect(attempt.followUp).toMatchObject({
      question: GOOD_FOLLOW_UP.question,
      path: 'written',
    });
    expect(await kinds()).toEqual(['opening', 'answer', 'follow_up']);
    expect(model.requests()).toHaveLength(1);
  });

  it('asks exactly one follow-up: a second answer is refused', async () => {
    model.willReply(GOOD_FOLLOW_UP);
    await handleAnswer(deps, UID, attemptId, ANSWER, 'typed');

    await expect(
      handleAnswer(deps, UID, attemptId, 'Another answer', 'typed'),
    ).rejects.toBeInstanceOf(AttemptPhaseError);
    expect((await kinds()).filter((kind) => kind === 'follow_up')).toHaveLength(
      1,
    );
    expect((await attempts.read(UID, attemptId)).answer?.text).toBe(ANSWER);
  });

  it('gives the same follow-up back when asked again, without calling the model', async () => {
    model.willReply(GOOD_FOLLOW_UP);
    const first = await handleAnswer(deps, UID, attemptId, ANSWER, 'typed');
    model.willReply(LEAKY_FOLLOW_UP);

    const again = await ensureFollowUp(deps, UID, attemptId);

    expect(again).toEqual(first);
    expect(model.requests()).toHaveLength(0);
  });

  it('retries once, saying why, then uses a question from the case file word for word', async () => {
    model.willReply(LEAKY_FOLLOW_UP);

    const followUp = await handleAnswer(deps, UID, attemptId, ANSWER, 'typed');
    const [first, second] = model.requests();

    expect(model.requests()).toHaveLength(2);
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
    expect(followUp.path).toBe('supplied');
    expect(NOTES.follow_up_ideas).toContain(followUp.question);
    expect(followUp.question).not.toContain('angle closure');
    expect(followUp.speech).toBe(
      `You said: lower the pressure with drops. ${followUp.question}`,
    );
  });

  it('uses a question from the case file when the model gives nothing usable', async () => {
    model.willReply(NOT_JSON);

    const followUp = await handleAnswer(deps, UID, attemptId, ANSWER, 'voice');

    expect(followUp.path).toBe('supplied');
    expect(followUp.respondingTo).toBeNull();
    expect(NOTES.follow_up_ideas).toContain(followUp.question);
    expect(followUp.speech).toBe(followUp.question);
    expect((await attempts.read(UID, attemptId)).turns[1]).toMatchObject({
      kind: 'answer',
      via: 'voice',
    });
  });

  it('keeps a working note of every attempt at the question', async () => {
    model.willReply(LEAKY_FOLLOW_UP);

    await handleAnswer(deps, UID, attemptId, ANSWER, 'typed');
    const [note] = attempts.workingNotes(UID, attemptId);

    expect(note).toMatchObject({ step: 'followup', path: 'supplied' });
    expect(note?.attempts).toHaveLength(2);
  });

  it('is refused when no follow-up is due', async () => {
    await expect(ensureFollowUp(deps, UID, attemptId)).rejects.toBeInstanceOf(
      AttemptPhaseError,
    );
  });
});

describe('replying to the follow-up', () => {
  const answered = async () => {
    model.willReply(GOOD_FOLLOW_UP);
    await handleAnswer(deps, UID, attemptId, ANSWER, 'typed');
  };

  it('is refused before the follow-up has been asked', async () => {
    await expect(
      handleFollowUpReply(deps, UID, attemptId, 'A reply', 'typed'),
    ).rejects.toBeInstanceOf(AttemptPhaseError);
  });

  it('produces a revision point with a page and a quotation copied from the note', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);

    const card = await handleFollowUpReply(
      deps,
      UID,
      attemptId,
      'Because it is ischaemic.',
      'typed',
    );
    const attempt = await attempts.read(UID, attemptId);

    expect(card.outcome).toBe('supported');
    expect(card.missed).toBe(NOTES.key_points[1]);
    expect(card.point).toBeTruthy();
    expect(card.page).toMatch(/^pp?\. \d/);
    expect(card.retrievedPages.length).toBeGreaterThan(0);
    expect(card.excerpt).toBeTruthy();
    expect(NOTE_TEXT).toContain(JSON.stringify(card.excerpt).slice(1, -1));
    expect(attempt.phase).toBe('complete');
    expect(attempt.revision).toEqual(card);
    expect(attempt.followUpReply?.text).toBe('Because it is ischaemic.');
    expect(await kinds()).toEqual([
      'opening',
      'answer',
      'follow_up',
      'follow_up_reply',
    ]);
  });

  it('still cites the note, searching by words alone, when the meaning-based search cannot be reached', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);
    const models: LanguageModelGateway = {
      callStep: (settings, prompt, schema, options) =>
        deps.models.callStep(settings, prompt, schema, options),
      embed: () => Promise.resolve(null),
    };

    const card = await handleFollowUpReply(
      { ...deps, models },
      UID,
      attemptId,
      'A reply',
      'typed',
    );

    expect(card.outcome).toBe('supported');
    expect(card.retrievalMode).toBe('keyword_only');
    expect(card.page).toMatch(/^pp?\. \d/);
    expect(NOTE_TEXT).toContain(JSON.stringify(card.excerpt).slice(1, -1));
  });

  it('judges the main answer, not the reply to the follow-up', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);

    await handleFollowUpReply(
      deps,
      UID,
      attemptId,
      'A reply mentioning sulfonamide allergy.',
      'typed',
    );
    const coverageRequest = JSON.stringify(model.requests()[0]);

    expect(coverageRequest).toContain('lower the pressure with drops');
    expect(coverageRequest).not.toContain(
      'A reply mentioning sulfonamide allergy',
    );
  });

  it('says no support was found, with no page or quotation, when the check rejects the quotation', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, NOT_SUPPORTED);

    const card = await handleFollowUpReply(
      deps,
      UID,
      attemptId,
      'A reply',
      'typed',
    );

    expect(card).toMatchObject({
      outcome: 'no_support',
      point: null,
      page: null,
      excerpt: null,
      message: LINES.noSupport,
    });
    expect((await attempts.read(UID, attemptId)).phase).toBe('complete');
  });

  it('records an empty reply as no reply', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);

    await handleFollowUpReply(deps, UID, attemptId, '   ', 'typed');

    expect((await attempts.read(UID, attemptId)).followUpReply?.text).toBe(
      '(no reply)',
    );
  });

  it('keeps the reply and waits when a step cannot run, and finishes when tried again', async () => {
    await answered();
    model.willReply(NOT_JSON);

    await expect(
      handleFollowUpReply(deps, UID, attemptId, 'A reply', 'typed'),
    ).rejects.toBeInstanceOf(RevisionUnavailableError);
    const waiting = await attempts.read(UID, attemptId);
    expect(waiting.phase).toBe('revising');
    expect(waiting.followUpReply?.text).toBe('A reply');
    expect(waiting.revision).toBeNull();

    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);
    const card = await prepareRevision(deps, UID, attemptId);

    expect(card.outcome).toBe('supported');
    expect((await attempts.read(UID, attemptId)).phase).toBe('complete');
  });

  it('names the step and the outcome when a step cannot run', async () => {
    await answered();
    model.willReply(NOT_JSON);

    await expect(
      handleFollowUpReply(deps, UID, attemptId, 'A reply', 'typed'),
    ).rejects.toMatchObject({
      code: 'REVISION_UNAVAILABLE',
      details: { step: 'coverage', outcome: 'schema_invalid' },
    });
  });

  it('gives the same revision point back when asked again, without calling the model', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);
    const card = await handleFollowUpReply(
      deps,
      UID,
      attemptId,
      'A reply',
      'typed',
    );
    model.willReply(NOT_JSON);

    expect(await prepareRevision(deps, UID, attemptId)).toEqual(card);
    expect(model.requests()).toHaveLength(0);
  });

  it('accepts one reply only', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);
    await handleFollowUpReply(deps, UID, attemptId, 'A reply', 'typed');

    await expect(
      handleFollowUpReply(deps, UID, attemptId, 'Another', 'typed'),
    ).rejects.toBeInstanceOf(AttemptPhaseError);
  });

  it('keeps working notes of what was judged missing and what was searched, for the server only', async () => {
    await answered();
    model.willReply(NOTHING_COVERED, CITE_FIRST_SENTENCE, SUPPORTED);

    await handleFollowUpReply(deps, UID, attemptId, 'A reply', 'typed');
    const note = attempts
      .workingNotes(UID, attemptId)
      .find((n) => n.step === 'revision');

    expect(note).toMatchObject({
      step: 'revision',
      target: { id: 'item_2', kind: 'key_point' },
    });
    expect(JSON.stringify(await attempts.read(UID, attemptId))).not.toContain(
      'item_2',
    );
  });
});
