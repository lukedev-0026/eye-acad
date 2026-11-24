import {
  AttemptError,
  MAX_TURNS,
  pushTurn,
  readAttempt,
  reveal,
  trace,
  updateAttempt,
} from './attempts.server'
import { buildCatalogue } from './catalogue'
import { loadCase } from './case.server'
import { loadStepsConfig } from './config.server'
import { LINES } from './lines'
import { fixedReply, replyFor } from './policy'
import type { ExaminerReply } from './policy'
import { MAX_UTTERANCE_CHARS, runSelector } from './selector.server'
import { synthesise, transcribe } from './voice.server'
import type { Speech } from './voice.server'

export type TurnTimings = {
  speechToTextMs: number | null
  modelMs: number | null
  textToSpeechMs: number | null
  serverTotalMs: number
}

export type TurnResult = {
  reply: ExaminerReply
  heard: string
  speech: Speech | null
  timings: TurnTimings
}

// One request for findings. A spoken request is turned into text first; from
// then on typed and spoken requests take exactly the same path.
export async function handleRequest(
  uid: string,
  attemptId: string,
  input: { text: string } | { audio: Buffer; mimeType: string },
): Promise<TurnResult> {
  const started = performance.now()
  const via = 'audio' in input ? 'voice' : 'typed'

  const attempt = await readAttempt(uid, attemptId)
  if (attempt.phase !== 'asking') {
    throw new AttemptError('This attempt is no longer taking questions.')
  }
  // The case and the settings are read fresh on every request.
  const [c, config] = await Promise.all([loadCase(), loadStepsConfig()])

  let heard = ''
  let speechToTextMs: number | null = null
  let reply: ExaminerReply | null = null
  if ('audio' in input) {
    const stt = await transcribe(input.audio, input.mimeType, buildCatalogue(c).names)
    speechToTextMs = stt.ms
    if (stt.ok) heard = stt.text.slice(0, MAX_UTTERANCE_CHARS)
    else reply = fixedReply('error', LINES.somethingWentWrong)
    await trace(uid, attemptId, { step: 'speech_to_text', ok: stt.ok, ms: stt.ms, model: stt.ok ? stt.model : null, error: stt.ok ? null : stt.error })
  } else {
    heard = input.text.trim().slice(0, MAX_UTTERANCE_CHARS)
  }

  let modelMs: number | null = null
  if (reply) {
    // speech-to-text failed: nothing more to do
  } else if (!heard) {
    // Silence or noise: no model call, nothing revealed.
    reply = fixedReply('did_not_catch', LINES.didNotCatch)
  } else if (attempt.turns.length >= MAX_TURNS) {
    reply = fixedReply('wants_to_answer', LINES.pressTheButton)
  } else {
    const run = await runSelector(
      c,
      heard,
      attempt.lastRequests as Parameters<typeof runSelector>[2],
      config.steps.selector,
    )
    modelMs = run.call.ms
    // Refusal, truncation, an unusable reply or a provider error all end the
    // same way: a fixed line, nothing revealed, and the trainee's turn again.
    reply = run.decision ? replyFor(run.decision) : fixedReply('error', LINES.somethingWentWrong)
    await trace(uid, attemptId, {
      step: 'selector',
      heard,
      outcome: run.call.outcome,
      model: run.call.model,
      ms: run.call.ms,
      picked: run.call.value ?? null,
      error: run.call.error ?? null,
    })
    const requests = run.call.value?.requests ?? []
    if (requests.length) {
      await updateAttempt(uid, attemptId, (a) => {
        a.lastRequests = requests
      })
    }
  }

  // The spoken words are the same string code built for the screen.
  const speech = await synthesise(reply.speech)
  const timings: TurnTimings = {
    speechToTextMs,
    modelMs,
    textToSpeechMs: speech?.ms ?? null,
    serverTotalMs: Math.round(performance.now() - started),
  }

  const final = reply
  await updateAttempt(uid, attemptId, (a) => {
    if (a.phase !== 'asking') return
    pushTurn(a, { speaker: 'trainee', text: heard || '(nothing heard)', via })
    const said = pushTurn(a, {
      speaker: 'examiner',
      text: final.lines.join('\n'),
      kind: final.kind,
      itemIds: final.items.map((i) => i.id),
    })
    reveal(a, final.items)
    a.timings.push({ turn: said.n, via, ...timings })
  })

  return { reply: final, heard, speech, timings }
}

// The opening words of an attempt, read aloud. The text comes from the saved
// attempt, not from the request, so this cannot be used to speak arbitrary
// text at the project's expense.
export async function openingSpeech(uid: string, attemptId: string): Promise<Speech | null> {
  const attempt = await readAttempt(uid, attemptId)
  const opening = attempt.turns.find((t) => t.kind === 'opening')
  return opening ? synthesise(opening.text) : null
}
