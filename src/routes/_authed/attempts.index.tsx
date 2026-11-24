import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import type { Phase } from '@/domain/attempt/attempt.schema';
import { useAttemptList } from '@/features/attempts/hooks/use-attempt';
import { auth } from '@/features/auth/lib/firebase';
import { messageFor } from '@/features/errors/lib/message-for';
import { startAttempt } from '@/server/functions/attempt.functions';

export const Route = createFileRoute('/_authed/attempts/')({
  component: Attempts,
});

const PHASE_LABEL: Record<Phase, string> = {
  asking: 'In progress: asking for findings',
  follow_up: 'In progress: follow-up question',
  revising: 'Preparing the revision point',
  complete: 'Finished',
};

function Attempts() {
  // The layout above only renders this once a user is signed in.
  const uid = auth.currentUser?.uid ?? '';
  const list = useAttemptList(uid);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const { attemptId } = await startAttempt();
      await navigate({ to: '/attempts/$attemptId', params: { attemptId } });
    } catch (thrown) {
      setError(messageFor(thrown, 'Could not start an attempt. Please try again.'));
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="row between">
        <h1>Your attempts</h1>
        <button className="button primary" disabled={busy} onClick={() => void begin()}>
          Start a new attempt
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {list === null ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="muted">No attempts yet.</p>
      ) : (
        <ul className="attempt-list">
          {list.map(({ id, attempt }) => (
            <li key={id}>
              <Link to="/attempts/$attemptId" params={{ attemptId: id }} className="attempt-link">
                <span className="attempt-title">
                  {new Date(attempt.createdAtMs).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="muted small">
                  {PHASE_LABEL[attempt.phase]} · {attempt.revealed.length} revealed · {attempt.turns.length} turns
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
