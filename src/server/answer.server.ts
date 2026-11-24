import type { PublicAttempt, RevisionCard } from '../lib/attempt-types'
import { AttemptError, pushTurn, readAttempt, trace, updateAttempt } from './attempts.server'
import { loadCitationGuidance, loadExaminerNotes } from './case.server'
import { loadStepsConfig } from './config.server'
import { MAX_ANSWER_CHARS, followUpSpeech, runFollowUp } from './followup.server'
import { loadNoteIndex } from './note-index.server'
import { produceRevision } from './revision-pipeline.server'

// Everything that happens after the trainee presses "Give my answer". This is
// the only code that reads the examiner notes.

export type FollowUpReplyOut = {
  question: string
  speech: string
  respondingTo: string | null
  path: 'written' | 'supplied' | 'fixed'
}

const clean = (text: string) => text.trim().slice(0, MAX_ANSWER_CHARS)

// Records the answer and asks the single follow-up. The phase change happens
// in a transaction, so pressing twice, or two tabs, still gives one follow-up.
export async function handleAnswer(
  uid: string,
  attemptId: string,
  rawText: string,
  via: 'typed' | 'voice',
): Promise<FollowUpReplyOut> {
  const text = clean(rawText)
  if (!text) throw new AttemptError('Please give your diagnosis and management first.')

  await updateAttempt(uid, attemptId, (a) => {
    if (a.phase !== 'asking') throw new AttemptError('An answer has already been given for this attempt.')
    a.phase = 'follow_up'
    a.answer = { text, atMs: Date.now() }
    pushTurn(a, { speaker: 'trainee', text, via, kind: 'answer' })
  })
  return ensureFollowUp(uid, attemptId)
}

// Produces the follow-up if the attempt is waiting for one. Safe to call
// again: an attempt that already has its follow-up gets the same one back.
export async function ensureFollowUp(uid: string, attemptId: string): Promise<FollowUpReplyOut> {
  const attempt = await readAttempt(uid, attemptId)
  if (attempt.followUp) return asReply(attempt.followUp)
  if (attempt.phase !== 'follow_up' || !attempt.answer) {
    throw new AttemptError('This attempt is not waiting for a follow-up question.')
  }

  const [notes, config] = await Promise.all([loadExaminerNotes(), loadStepsConfig()])
  const result = await runFollowUp(notes, attempt.answer.text, config.steps.followup)
  const speech = followUpSpeech(result)

  const saved = await updateAttempt(uid, attemptId, (a) => {
    if (a.followUp) return a.followUp
    a.followUp = {
      question: result.question,
      respondingTo: result.respondingTo,
      path: result.path,
      atMs: Date.now(),
    }
    pushTurn(a, { speaker: 'examiner', text: result.question, kind: 'follow_up' })
    return a.followUp
  })
  await trace(uid, attemptId, {
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
  })
  return { ...asReply(saved), speech }
}

function asReply(f: NonNullable<PublicAttempt['followUp']>): FollowUpReplyOut {
  return {
    question: f.question,
    speech: f.path === 'supplied' && f.respondingTo ? `You said: ${f.respondingTo}. ${f.question}` : f.question,
    respondingTo: f.respondingTo,
    path: f.path,
  }
}

// Records the reply to the follow-up, then prepares the revision point.
export async function handleFollowUpReply(
  uid: string,
  attemptId: string,
  rawText: string,
  via: 'typed' | 'voice',
): Promise<RevisionCard> {
  const text = clean(rawText) || '(no reply)'
  await updateAttempt(uid, attemptId, (a) => {
    if (a.phase !== 'follow_up' || !a.followUp || a.followUpReply) {
      throw new AttemptError('This attempt is not waiting for a reply to the follow-up.')
    }
    a.followUpReply = { text, atMs: Date.now() }
    a.phase = 'revising'
    pushTurn(a, { speaker: 'trainee', text, via, kind: 'follow_up_reply' })
  })
  return prepareRevision(uid, attemptId)
}

// Runs the revision pipeline for an attempt that is waiting for it. If a step
// cannot run, the attempt stays in `revising` and this can be called again.
export async function prepareRevision(uid: string, attemptId: string): Promise<RevisionCard> {
  const attempt = await readAttempt(uid, attemptId)
  if (attempt.revision) return attempt.revision
  if (attempt.phase !== 'revising' || !attempt.answer) {
    throw new AttemptError('This attempt is not waiting for a revision point.')
  }

  const [notes, guidance, config, index] = await Promise.all([
    loadExaminerNotes(),
    loadCitationGuidance(),
    loadStepsConfig(),
    loadNoteIndex(),
  ])
  const { card, trace: working } = await produceRevision(
    { notes, answer: attempt.answer.text, followUpQuestion: attempt.followUp?.question ?? null, guidance },
    config,
    index,
  )

  await updateAttempt(uid, attemptId, (a) => {
    if (a.revision) return
    a.revision = card
    a.phase = 'complete'
  })
  await trace(uid, attemptId, {
    step: 'revision',
    coverage: working.coverage
      ? {
          outcome: working.coverage.call.outcome,
          model: working.coverage.call.model,
          ms: working.coverage.call.ms,
          items: working.coverage.items.map((i) => ({ id: i.id, status: i.status, modelStatus: i.modelStatus, quote: i.quote })),
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
  })
  return card
}
