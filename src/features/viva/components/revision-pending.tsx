import type { JSX } from 'react';

interface RevisionPendingProps {
  // Why the revision point could not be prepared, when it could not.
  problem: string | null;
  onRetry: () => void;
}

// Shown between the trainee's reply and the revision point: either it is
// being prepared, or it could not be and can be tried again.
export function RevisionPending({ problem, onRetry }: RevisionPendingProps): JSX.Element {
  return (
    <section className="panel" role="status">
      <h2>Revision point</h2>
      {problem ? (
        <>
          <p>{problem}</p>
          <button className="button" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <p className="muted">Preparing your revision point from the reference note…</p>
      )}
    </section>
  );
}
