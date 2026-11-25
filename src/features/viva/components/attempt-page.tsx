import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

import { useAttempt } from '@/features/attempts/hooks/use-attempt';
import { auth } from '@/features/auth/lib/firebase';
import { Viva } from '@/features/viva/components/viva';

export function AttemptPage({ attemptId }: { attemptId: string }): JSX.Element {
  const uid = auth.currentUser?.uid ?? '';
  const state = useAttempt(uid, attemptId);

  if (state.status === 'loading') return <p className="page muted">Loading…</p>;
  if (state.status === 'unavailable') {
    return (
      <main className="page narrow">
        <h1>Attempt not available</h1>
        <p className="lede">
          It does not exist, or it belongs to someone else.
        </p>
        <Link to="/attempts" className="button">
          Back to your attempts
        </Link>
      </main>
    );
  }
  return <Viva attemptId={attemptId} attempt={state.attempt} />;
}
