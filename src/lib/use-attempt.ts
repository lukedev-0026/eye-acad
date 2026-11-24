import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { PublicAttemptSchema } from './attempt-types'
import type { PublicAttempt } from './attempt-types'
import { db } from './firebase'

export type AttemptState =
  | { status: 'loading' }
  | { status: 'ready'; attempt: PublicAttempt }
  | { status: 'unavailable' }

// Live view of one saved attempt, read straight from Firestore under the
// owner-only rules. This is why a page refresh brings everything back: the
// screen is drawn from the saved record, not from memory.
export function useAttempt(uid: string, attemptId: string): AttemptState {
  const [state, setState] = useState<AttemptState>({ status: 'loading' })
  useEffect(() => {
    setState({ status: 'loading' })
    return onSnapshot(
      doc(db, 'users', uid, 'attempts', attemptId),
      (snap) => {
        const parsed = PublicAttemptSchema.safeParse(snap.data())
        setState(
          snap.exists() && parsed.success
            ? { status: 'ready', attempt: parsed.data }
            : { status: 'unavailable' },
        )
      },
      // Not found and "not yours" look the same to the trainee, on purpose.
      () => setState({ status: 'unavailable' }),
    )
  }, [uid, attemptId])
  return state
}

export type AttemptSummary = { id: string; attempt: PublicAttempt }

export function useAttemptList(uid: string): Array<AttemptSummary> | null {
  const [list, setList] = useState<Array<AttemptSummary> | null>(null)
  useEffect(() => {
    const q = query(
      collection(db, 'users', uid, 'attempts'),
      orderBy('createdAtMs', 'desc'),
    )
    return onSnapshot(
      q,
      (snap) => {
        const out: Array<AttemptSummary> = []
        for (const d of snap.docs) {
          const parsed = PublicAttemptSchema.safeParse(d.data())
          if (parsed.success) out.push({ id: d.id, attempt: parsed.data })
        }
        setList(out)
      },
      () => setList([]),
    )
  }, [uid])
  return list
}
