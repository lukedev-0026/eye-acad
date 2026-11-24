import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useReducer, useRef, useState } from 'react'
import { RevisionCardView } from '../../components/RevisionCardView'
import { TalkButton } from '../../components/TalkButton'
import type { PublicAttempt, RevealedItem, Turn } from '../../lib/attempt-types'
import { playReply } from '../../lib/audio'
import type { ReplyAudio } from '../../lib/audio'
import { auth } from '../../lib/firebase'
import { asTsv, summarise } from '../../lib/latency'
import type { TurnTiming } from '../../lib/latency'
import { recordingSupported, useRecorder } from '../../lib/recorder'
import { TURN_LABEL, canTraineeAct, nextTurnState } from '../../lib/turn-machine'
import type { TurnState } from '../../lib/turn-machine'
import { useAttempt } from '../../lib/use-attempt'
import {
  askSpoken,
  askTyped,
  giveAnswer,
  replyToFollowUp,
  retryFollowUp,
  retryRevision,
  speakOpening,
  transcribeOnly,
} from '../../server/functions'

export const Route = createFileRoute('/_authed/attempts/$attemptId')({
  component: AttemptPage,
})

function AttemptPage() {
  const { attemptId } = Route.useParams()
  const uid = auth.currentUser?.uid ?? ''
  const state = useAttempt(uid, attemptId)

  if (state.status === 'loading') return <p className="page muted">Loading…</p>
  if (state.status === 'unavailable') {
    return (
      <main className="page narrow">
        <h1>Attempt not available</h1>
        <p className="lede">It does not exist, or it belongs to someone else.</p>
        <Link to="/attempts" className="button">
          Back to your attempts
        </Link>
      </main>
    )
  }
  return <Viva attemptId={attemptId} attempt={state.attempt} />
}

const HINT: Record<'asking' | 'answering' | 'follow_up', Record<TurnState, string>> = {
  asking: {
    your_turn: 'Hold the button and ask for a finding, or type a request.',
    listening: 'Release the button when you have finished.',
    thinking: 'Please wait.',
    speaking: 'Please wait until the examiner has finished.',
  },
  answering: {
    your_turn: 'Give your diagnosis and immediate management, then submit.',
    listening: 'Release the button when you have finished.',
    thinking: 'Please wait.',
    speaking: 'Please wait until the examiner has finished.',
  },
  follow_up: {
    your_turn: 'Reply to the follow-up question, then send.',
    listening: 'Release the button when you have finished.',
    thinking: 'Please wait.',
    speaking: 'Please wait until the examiner has finished.',
  },
}

function Viva({ attemptId, attempt }: { attemptId: string; attempt: PublicAttempt }) {
  const [turn, send] = useReducer(nextTurnState, 'your_turn' as TurnState)
  const [request, setRequest] = useState('')
  const [answering, setAnswering] = useState(false)
  const [draft, setDraft] = useState('')
  const [dictated, setDictated] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [revisionFailed, setRevisionFailed] = useState(false)
  const [timings, setTimings] = useState<Array<TurnTiming>>([])
  const recorder = useRecorder()
  const player = useRef<{ stop: () => void } | null>(null)
  const openingTried = useRef(false)

  const phase = attempt.phase
  const mode = phase === 'asking' ? (answering ? 'answering' : 'asking') : phase === 'follow_up' ? 'follow_up' : null
  const canAct = canTraineeAct(turn)
  const micOk = recordingSupported()

  useEffect(() => () => player.current?.stop(), [])

  // Plays a reply and holds the "Examiner is speaking" state for as long as it
  // lasts. With no audio, the turn simply passes back.
  async function speak(audio: ReplyAudio | null): Promise<number | null> {
    if (!audio) {
      send({ type: 'REPLY_SILENT' })
      return null
    }
    send({ type: 'REPLY_SPEAKING' })
    const playback = playReply(audio)
    player.current = playback
    const startedAt = await playback.started
    await playback.ended
    send({ type: 'SPEECH_ENDED' })
    return startedAt
  }

  // The examiner reads the opening aloud once, on a brand-new attempt.
  useEffect(() => {
    if (openingTried.current || phase !== 'asking' || attempt.turns.length !== 1) return
    openingTried.current = true
    speakOpening({ data: { attemptId } })
      .then(({ audio }) => {
        if (!audio) return
        send({ type: 'SUBMIT_TEXT' })
        return speak(audio)
      })
      .catch(() => send({ type: 'FAILED' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

  function fail(message: string) {
    setProblem(message)
    send({ type: 'FAILED' })
  }

  async function finishTurn(
    releasedAt: number,
    via: 'voice' | 'typed',
    reply: { audio: ReplyAudio | null; timings: TurnTiming['server'] },
  ) {
    const toResponseMs = Math.round(performance.now() - releasedAt)
    const playingAt = await speak(reply.audio)
    setTimings((list) => [
      ...list,
      {
        n: list.length + 1,
        via,
        toResponseMs,
        toPlaybackMs: playingAt === null ? null : Math.round(playingAt - releasedAt),
        server: reply.timings,
      },
    ])
  }

  async function askText() {
    const text = request.trim()
    if (!text || !canAct) return
    const releasedAt = performance.now()
    send({ type: 'SUBMIT_TEXT' })
    setProblem(null)
    setRequest('')
    try {
      await finishTurn(releasedAt, 'typed', await askTyped({ data: { attemptId, text } }))
    } catch {
      fail('That request did not go through. Please ask again.')
    }
  }

  async function startListening() {
    if (!canAct) return
    setProblem(null)
    try {
      await recorder.start()
      send({ type: 'START_LISTENING' })
    } catch {
      fail('The microphone is not available. You can type instead.')
    }
  }

  async function stopAndAsk() {
    // The voice-turn timer starts here: the trainee has finished speaking.
    const releasedAt = performance.now()
    const clip = await recorder.stop()
    if (!clip) {
      send({ type: 'CANCEL_LISTENING' })
      return
    }
    send({ type: 'STOP_LISTENING' })
    try {
      const reply = await askSpoken({ data: { attemptId, audioBase64: clip.base64, mimeType: clip.mimeType } })
      await finishTurn(releasedAt, 'voice', reply)
    } catch {
      fail('That did not go through. Please try again, or type your request.')
    }
  }

  // For the answer and the reply, speech is turned into text and shown first,
  // so the trainee can see and correct it before it is submitted.
  async function stopAndDictate() {
    const clip = await recorder.stop()
    if (!clip) {
      send({ type: 'CANCEL_LISTENING' })
      return
    }
    send({ type: 'STOP_LISTENING' })
    try {
      const heard = await transcribeOnly({ data: { attemptId, audioBase64: clip.base64, mimeType: clip.mimeType } })
      if (heard.ok && heard.text) {
        setDraft((d) => (d ? `${d} ${heard.text}` : heard.text))
        setDictated(true)
      } else {
        setProblem("Sorry, I didn't catch that. Please try again, or type.")
      }
      send({ type: 'REPLY_SILENT' })
    } catch {
      fail('That did not go through. Please try again, or type.')
    }
  }

  async function submitAnswer() {
    const text = draft.trim()
    if (!text || !canAct) return
    send({ type: 'SUBMIT_TEXT' })
    setProblem(null)
    try {
      const followUp = await giveAnswer({ data: { attemptId, text, via: dictated ? 'voice' : 'typed' } })
      setDraft('')
      setDictated(false)
      setAnswering(false)
      await speak(followUp.audio)
    } catch {
      fail('Your answer was not saved. Please try again.')
    }
  }

  async function submitReply() {
    if (!canAct) return
    send({ type: 'SUBMIT_TEXT' })
    setProblem(null)
    setRevisionFailed(false)
    try {
      await replyToFollowUp({ data: { attemptId, text: draft.trim(), via: dictated ? 'voice' : 'typed' } })
      setDraft('')
    } catch {
      // The reply itself is saved first; what can fail is preparing the card.
      setRevisionFailed(true)
    }
    send({ type: 'REPLY_SILENT' })
  }

  async function tryRevisionAgain() {
    setRevisionFailed(false)
    try {
      await retryRevision({ data: { attemptId } })
    } catch {
      setRevisionFailed(true)
    }
  }

  async function tryFollowUpAgain() {
    send({ type: 'SUBMIT_TEXT' })
    try {
      const followUp = await retryFollowUp({ data: { attemptId } })
      await speak(followUp.audio)
    } catch {
      fail('The follow-up question could not be prepared. Please try again.')
    }
  }

  const summary = summarise(timings)

  return (
    <main className="page viva">
      <div className="row between">
        <div>
          <h1>{attempt.caseTitle || 'Practice viva'}</h1>
          <p className="muted small">Fictional case for practice. Not a real patient.</p>
        </div>
        <Link to="/attempts" className="button quiet">
          All attempts
        </Link>
      </div>

      {mode ? <TurnBanner state={turn} hint={HINT[mode][turn]} /> : null}

      {phase === 'complete' && attempt.revision ? <RevisionCardView card={attempt.revision} /> : null}
      {phase === 'revising' ? (
        <section className="panel" role="status">
          <h2>Revision point</h2>
          {revisionFailed ? (
            <>
              <p>The revision point could not be prepared just now.</p>
              <button className="button" onClick={() => void tryRevisionAgain()}>
                Try again
              </button>
            </>
          ) : (
            <p className="muted">Preparing your revision point from the reference note…</p>
          )}
        </section>
      ) : null}

      <div className="viva-grid">
        <section aria-label="Conversation" className="panel">
          <h2>Conversation</h2>
          <Transcript turns={attempt.turns} followUp={attempt.followUp} />
          {problem ? (
            <p className="notice error" role="alert">
              {problem}
            </p>
          ) : null}

          {mode === 'asking' ? (
            <div className="composer">
              {micOk ? (
                <TalkButton
                  label="Hold to talk"
                  disabled={!canAct && turn !== 'listening'}
                  recording={turn === 'listening'}
                  onStart={() => void startListening()}
                  onStop={() => void stopAndAsk()}
                />
              ) : (
                <p className="muted small">This browser cannot record audio. Type your requests instead.</p>
              )}
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault()
                  void askText()
                }}
              >
                <label htmlFor="request" className="visually-hidden">
                  Type a request
                </label>
                <input
                  id="request"
                  className="input"
                  value={request}
                  maxLength={500}
                  autoComplete="off"
                  placeholder="Or type: what is the pressure in the right eye?"
                  disabled={!canAct}
                  onChange={(e) => setRequest(e.target.value)}
                />
                <button className="button" disabled={!canAct || !request.trim()}>
                  Ask
                </button>
              </form>
              <div className="row end">
                <button className="button primary" disabled={!canAct} onClick={() => setAnswering(true)}>
                  Give my answer
                </button>
              </div>
            </div>
          ) : null}

          {mode === 'answering' || mode === 'follow_up' ? (
            <div className="composer">
              {mode === 'follow_up' && !attempt.followUp ? (
                <div className="row">
                  <span className="muted">The follow-up question is being prepared…</span>
                  <button className="button quiet" disabled={!canAct} onClick={() => void tryFollowUpAgain()}>
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="draft" className="small muted">
                    {mode === 'answering'
                      ? 'Your diagnosis and immediate management'
                      : 'Your reply to the follow-up question'}
                  </label>
                  <textarea
                    id="draft"
                    className="textarea"
                    value={draft}
                    maxLength={4000}
                    disabled={!canAct}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="row between">
                    {micOk ? (
                      <TalkButton
                        label="Hold to dictate"
                        disabled={!canAct && turn !== 'listening'}
                        recording={turn === 'listening'}
                        onStart={() => void startListening()}
                        onStop={() => void stopAndDictate()}
                      />
                    ) : (
                      <span />
                    )}
                    <span className="row">
                      {mode === 'answering' ? (
                        <>
                          <button className="button quiet" disabled={!canAct} onClick={() => setAnswering(false)}>
                            Back to asking
                          </button>
                          <button
                            className="button primary"
                            disabled={!canAct || !draft.trim()}
                            onClick={() => void submitAnswer()}
                          >
                            Submit my answer
                          </button>
                        </>
                      ) : (
                        <button className="button primary" disabled={!canAct} onClick={() => void submitReply()}>
                          Send reply
                        </button>
                      )}
                    </span>
                  </div>
                  {mode === 'answering' ? (
                    <p className="muted small">
                      Submitting ends the questions. The examiner then asks one follow-up.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>

        <section aria-label="Findings revealed so far" className="panel">
          <h2>Revealed so far</h2>
          <Revealed items={attempt.revealed} />
        </section>
      </div>

      {timings.length ? (
        <details className="timing">
          <summary>
            Response times this session
            {summary
              ? `: spoken turns, release to playback, median ${summary.medianMs} ms (range ${summary.minMs}–${summary.maxMs}, n=${summary.n})`
              : ''}
          </summary>
          <p className="muted small">
            The timer starts when the talk button is released and stops when the reply audio starts playing.
          </p>
          <pre className="timing-table">{asTsv(timings)}</pre>
        </details>
      ) : null}
    </main>
  )
}

// The label is text, with a symbol and a border style to match, so it reads
// the same in greyscale and to a screen reader.
function TurnBanner({ state, hint }: { state: TurnState; hint: string }) {
  const mark = { your_turn: '●', listening: '◉', thinking: '…', speaking: '♪' }[state]
  return (
    <div className={`turn-banner turn-${state}`} role="status" aria-live="polite">
      <span className="turn-mark" aria-hidden="true">
        {mark}
      </span>
      <span className="turn-label">{TURN_LABEL[state]}</span>
      <span className="turn-hint">{hint}</span>
    </div>
  )
}

function Transcript({ turns, followUp }: { turns: Array<Turn>; followUp: PublicAttempt['followUp'] }) {
  const end = useRef<HTMLLIElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [turns.length])
  return (
    <ol className="transcript">
      {turns.map((t) => (
        <li key={t.n} className={`turn turn-by-${t.speaker}`}>
          <span className="turn-who">
            {t.speaker === 'examiner' ? 'Examiner' : 'You'}
            {t.via === 'voice' ? ' (spoken)' : ''}
            {t.kind === 'follow_up' ? ' · follow-up question' : ''}
            {t.kind === 'answer' ? ' · your answer' : ''}
          </span>
          {t.kind === 'follow_up' && followUp?.respondingTo ? (
            <p className="muted small">Responding to: “{followUp.respondingTo}”</p>
          ) : null}
          {t.text.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </li>
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
  )
}

function Revealed({ items }: { items: Array<RevealedItem> }) {
  if (items.length === 0) {
    return <p className="muted small">Nothing yet. Ask the examiner for a finding.</p>
  }
  return (
    <ul className="revealed">
      {items.map((item) => (
        <li key={item.id} className={item.available ? 'finding' : 'finding unavailable'}>
          <span className="finding-label">
            {item.eyeLabel ? `${item.eyeLabel} · ` : ''}
            {item.label}
          </span>
          <span className="finding-value">{item.value}</span>
          {item.method ? <span className="finding-method muted small">{item.method}</span> : null}
        </li>
      ))}
    </ul>
  )
}
