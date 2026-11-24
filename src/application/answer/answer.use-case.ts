import type { VivaDeps } from '@/application/deps';
import { produceRevision } from '@/application/revision/produce-revision';
import { followUpSpeech, runFollowUp } from '@/application/steps/followup.step';
import { getLogger } from '@/common/logging/logger.server';
import { MAX_ANSWER_CHARS, pushTurn } from '@/domain/attempt/attempt';
import { AttemptPhaseError, EmptyAnswerError } from '@/domain/attempt/attempt.error';
import type { PublicAttempt, RevisionCard } from '@/domain/attempt/attempt.schema';
import { loadCitationGuidance, loadExaminerNotes } from '@/infrastructure/files/case-file.loader';
import { loadNoteIndex } from '@/infrastructure/files/note-index.loader';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';

type Deps = Pick<VivaDeps, 'attempts' | 'models'>;

const log = () => getLogger('answer');

// Everything that happens after the trainee presses "Give my answer". This is
// the only code that reads the examiner notes.

export interface FollowUpReplyOut {
  question: string;
  speech: string;
  respondingTo: string | null;
  path: 'written' | 'supplied' | 'fixed';
}

const clean = (text: string) => text.trim().slice(0, MAX_ANSWER_CHARS);

// Records the answer and asks the single follow-up. The phase change happens
// in a transaction, so pressing twice, or two tabs, still gives one follow-up.
export async function handleAnswer(
  deps: Deps,
  uid: string,
  attemptId: string,
  rawText: string,
  via: 'typed' | 'voice',
): Promise<FollowUpReplyOut> {
  const text = clean(rawText);
  if (!text) throw new EmptyAnswerError();

  await deps.attempts.update(uid, attemptId, (a) => {
    if (a.phase !== 'asking') throw new AttemptPhaseError('An answer has already been given for this attempt.');
    a.phase = 'follow_up';
    a.answer = { text, atMs: Date.now() };
    pushTurn(a, { speaker: 'trainee', text, via, kind: 'answer' });
  });
  return ensureFollowUp(deps, uid, attemptId);
}

// Produces the follow-up if the attempt is waiting for one. Safe to call
// again: an attempt that already has its follow-up gets the same one back.
export async function ensureFollowUp(deps: Deps, uid: string, attemptId: string): Promise<FollowUpReplyOut> {
  const attempt = await deps.attempts.read(uid, attemptId);
  if (attempt.followUp) return asReply(attempt.followUp);
  if (attempt.phase !== 'follow_up' || !attempt.answer) {
    throw new AttemptPhaseError('This attempt is not waiting for a follow-up question.');
  }

  const [notes, config] = await Promise.all([loadExaminerNotes(), loadStepsConfig()]);
  const result = await runFollowUp(deps.models, notes, attempt.answer.text, config.steps.followup);
  const speech = followUpSpeech(result);

  const saved = await deps.attempts.update(uid, attemptId, (a) => {
    if (a.followUp) return a.followUp;
    a.followUp = {
      question: result.question,
      respondingTo: result.respondingTo,
      path: result.path,
      atMs: Date.now(),
    };
    pushTurn(a, { speaker: 'examiner', text: result.question, kind: 'follow_up' });
    return a.followUp;
  });
  await deps.attempts.appendWorkingNote(uid, attemptId, {
    step: 'followup',
    path: result.path,
    ideaIndex: result.ideaIndex,
    attempts: result.attempts.map((x) => ({
      outcome: x.call.outcome,
      model: x.call.model,
      ms: x.call.ms,
      value: x.call.value ?? null,
      questionCheck: x.questionCheck ?? null,
      anchorCheck: x.anchorCheck ?? null,
    })),
  });
  log().info(
    {
      actionResult: 'DONE',
      path: result.path,
      modelCalls: result.attempts.length,
      respondsToQuote: result.respondingTo !== null,
    },
    'ensureFollowUp.asked',
  );
  return { ...asReply(saved), speech };
}

function asReply(f: NonNullable<PublicAttempt['followUp']>): FollowUpReplyOut {
  return {
    question: f.question,
    speech: f.path === 'supplied' && f.respondingTo ? `You said: ${f.respondingTo}. ${f.question}` : f.question,
    respondingTo: f.respondingTo,
    path: f.path,
  };
}

// Records the reply to the follow-up, then prepares the revision point.
export async function handleFollowUpReply(
  deps: Deps,
  uid: string,
  attemptId: string,
  rawText: string,
  via: 'typed' | 'voice',
): Promise<RevisionCard> {
  const text = clean(rawText) || '(no reply)';
  await deps.attempts.update(uid, attemptId, (a) => {
    if (a.phase !== 'follow_up' || !a.followUp || a.followUpReply) {
      throw new AttemptPhaseError('This attempt is not waiting for a reply to the follow-up.');
    }
    a.followUpReply = { text, atMs: Date.now() };
    a.phase = 'revising';
    pushTurn(a, { speaker: 'trainee', text, via, kind: 'follow_up_reply' });
  });
  return prepareRevision(deps, uid, attemptId);
}

// Runs the revision pipeline for an attempt that is waiting for it. If a step
// cannot run, the attempt stays in `revising` and this can be called again.
export async function prepareRevision(deps: Deps, uid: string, attemptId: string): Promise<RevisionCard> {
  const attempt = await deps.attempts.read(uid, attemptId);
  if (attempt.revision) return attempt.revision;
  if (attempt.phase !== 'revising' || !attempt.answer) {
    throw new AttemptPhaseError('This attempt is not waiting for a revision point.');
  }

  const [notes, guidance, config, index] = await Promise.all([
    loadExaminerNotes(),
    loadCitationGuidance(),
    loadStepsConfig(),
    loadNoteIndex(),
  ]);
  const { card, trace: working } = await produceRevision(
    deps.models,
    { notes, answer: attempt.answer.text, followUpQuestion: attempt.followUp?.question ?? null, guidance },
    config,
    index,
  );

  await deps.attempts.update(uid, attemptId, (a) => {
    if (a.revision) return;
    a.revision = card;
    a.phase = 'complete';
  });
  await deps.attempts.appendWorkingNote(uid, attemptId, {
    step: 'revision',
    coverage: working.coverage
      ? {
          outcome: working.coverage.call.outcome,
          model: working.coverage.call.model,
          ms: working.coverage.call.ms,
          items: working.coverage.items.map((i) => ({
            id: i.id,
            status: i.status,
            modelStatus: i.modelStatus,
            quote: i.quote,
          })),
          chosenBy: working.coverage.targetChosenBy,
        }
      : null,
    target: working.target,
    retrieval: working.retrieval
      ? {
          mode: working.retrieval.mode,
          best: working.retrieval.best,
          results: working.retrieval.results.map((r) => ({
            chunk: r.chunk.id,
            pages: r.chunk.pages,
            keywordRank: r.keywordRank,
            meaningRank: r.meaningRank,
            cosine: r.cosine,
          })),
        }
      : null,
    revision: working.revision
      ? {
          outcome: working.revision.outcome,
          model: working.revision.call.model,
          ms: working.revision.call.ms,
          value: working.revision.call.value ?? null,
          wordingCheck: working.revision.wordingCheck,
        }
      : null,
    verifier: working.verifier
      ? { model: working.verifier.call.model, ms: working.verifier.call.ms, value: working.verifier.call.value ?? null }
      : null,
    keyPointCheck: working.keyPointCheck
      ? { ms: working.keyPointCheck.call.ms, value: working.keyPointCheck.call.value ?? null }
      : null,
  });
  log().info(
    {
      actionResult: 'DONE',
      outcome: card.outcome,
      targetKind: working.target?.kind ?? null,
      targetChosenBy: working.coverage?.targetChosenBy ?? null,
      retrievalMode: card.retrievalMode,
      pointSource: card.pointSource,
    },
    'prepareRevision.completed',
  );
  return card;
}
