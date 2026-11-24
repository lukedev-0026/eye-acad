import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useReducer, useRef, useState } from 'react'
import type { PublicAttempt, RevealedItem, Turn } from '../../lib/attempt-types'
import { auth } from '../../lib/firebase'
import {
  TURN_HINT,
  TURN_LABEL,
  canTraineeAct,
  nextTurnState,
} from '../../lib/turn-machine'
import type { TurnState } from '../../lib/turn-machine'
import { useAttempt } from '../../lib/use-attempt'
import { askTyped } from '../../server/functions'

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

function Viva({ attemptId, attempt }: { attemptId: string; attempt: PublicAttempt }) {
  const [turn, send] = useReducer(nextTurnState, 'your_turn' as TurnState)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const asking = attempt.phase === 'asking'

  async function ask() {
    const request = text.trim()
    if (!request || !canTraineeAct(turn)) return
    send({ type: 'SUBMIT_TEXT' })
    setProblem(null)
    setText('')
    try {
      await askTyped({ data: { attemptId, text: request } })
      send({ type: 'REPLY_SILENT' })
    } catch {
      setProblem('That request did not go through. Please ask again.')
      send({ type: 'FAILED' })
    }
  }

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

      <TurnBanner state={asking ? turn : 'your_turn'} active={asking} />

      <div className="viva-grid">
        <section aria-label="Conversation" className="panel">
          <h2>Conversation</h2>
          <Transcript turns={attempt.turns} />
          {problem ? (
            <p className="notice error" role="alert">
              {problem}
            </p>
          ) : null}
          {asking ? (
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault()
                void ask()
              }}
            >
              <label htmlFor="request" className="small muted">
                Type a request
              </label>
              <div className="row">
                <input
                  id="request"
                  className="input"
                  value={text}
                  maxLength={500}
                  autoComplete="off"
                  placeholder="For example: what is the pressure in the right eye?"
                  disabled={!canTraineeAct(turn)}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="button primary" disabled={!canTraineeAct(turn) || !text.trim()}>
                  Ask
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section aria-label="Findings revealed so far" className="panel">
          <h2>Revealed so far</h2>
          <Revealed items={attempt.revealed} />
        </section>
      </div>
    </main>
  )
}

// The label is text, not colour, so it reads the same in greyscale and to a
// screen reader.
function TurnBanner({ state, active }: { state: TurnState; active: boolean }) {
  if (!active) return null
  return (
    <div className={`turn-banner turn-${state}`} role="status" aria-live="polite">
      <span className="turn-mark" aria-hidden="true">
        {state === 'your_turn' ? '●' : state === 'listening' ? '◉' : state === 'thinking' ? '…' : '♪'}
      </span>
      <span className="turn-label">{TURN_LABEL[state]}</span>
      <span className="turn-hint">{TURN_HINT[state]}</span>
    </div>
  )
}

function Transcript({ turns }: { turns: Array<Turn> }) {
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
          </span>
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
