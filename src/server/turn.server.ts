import { z } from 'zod'
import {
  AttemptError,
  MAX_TURNS,
  pushTurn,
  readAttempt,
  reveal,
  trace,
  updateAttempt,
} from './attempts.server'
import { loadCase } from './case.server'
import { loadStepsConfig } from './config.server'
import { LINES } from './lines'
import { fixedReply, replyFor } from './policy'
import type { ExaminerReply } from './policy'
import { MAX_UTTERANCE_CHARS, runSelector } from './selector.server'

export const AskInputSchema = z.object({
  attemptId: z.string().min(1).max(64),
  text: z.string().max(2000),
})

export type TurnResult = {
  reply: ExaminerReply
  heard: string
  timings: { modelMs: number | null; serverTotalMs: number }
}

// One request for findings, already in text form. Voice turns arrive here
// after speech-to-text, so typed and spoken requests share every later step.
export async function handleRequest(
  uid: string,
  attemptId: string,
  text: string,
  via: 'typed' | 'voice',
  extraTimings: { speechToTextMs: number | null } = { speechToTextMs: null },
): Promise<TurnResult> {
  const started = performance.now()
  const heard = text.trim().slice(0, MAX_UTTERANCE_CHARS)

  const attempt = await readAttempt(uid, attemptId)
  if (attempt.phase !== 'asking') {
    throw new AttemptError('This attempt is no longer taking questions.')
  }

  let reply: ExaminerReply
  let modelMs: number | null = null

  if (!heard) {
    // Silence or noise: no model call, nothing revealed.
    reply = fixedReply('did_not_catch', LINES.didNotCatch)
  } else if (attempt.turns.length >= MAX_TURNS) {
    reply = fixedReply('wants_to_answer', LINES.pressTheButton)
  } else {
    // The case and the settings are read fresh on every request.
    const [c, config] = await Promise.all([loadCase(), loadStepsConfig()])
    const run = await runSelector(
      c,
      heard,
      attempt.lastRequests as Parameters<typeof runSelector>[2],
      config.steps.selector,
    )
    modelMs = run.call.ms
    // Refusal, truncation, an unusable reply or a provider error all end the
    // same way: a fixed line, nothing revealed, and the trainee's turn again.
    reply = run.decision
      ? replyFor(run.decision)
      : fixedReply('error', LINES.somethingWentWrong)
    await trace(uid, attemptId, {
      step: 'selector',
      heard,
      outcome: run.call.outcome,
      model: run.call.model,
      ms: run.call.ms,
      picked: run.call.value ?? null,
      error: run.call.error ?? null,
    })
    if (run.call.value) {
      const requests = run.call.value.requests
      await updateAttempt(uid, attemptId, (a) => {
        if (requests.length) a.lastRequests = requests
      })
    }
  }

  const serverTotalMs = Math.round(performance.now() - started)
  await updateAttempt(uid, attemptId, (a) => {
    if (a.phase !== 'asking') return
    pushTurn(a, { speaker: 'trainee', text: heard || '(nothing heard)', via })
    const said = pushTurn(a, {
      speaker: 'examiner',
      text: reply.lines.join('\n'),
      kind: reply.kind,
      itemIds: reply.items.map((i) => i.id),
    })
    reveal(a, reply.items)
    a.timings.push({
      turn: said.n,
      via,
      speechToTextMs: extraTimings.speechToTextMs,
      modelMs,
      textToSpeechMs: null,
      serverTotalMs,
    })
  })

  return { reply, heard, timings: { modelMs, serverTotalMs } }
}
