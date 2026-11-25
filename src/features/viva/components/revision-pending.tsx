import type { JSX } from 'react';

interface RevisionPendingProps {
  problem: string | null;
  onRetry: () => void;
}

export function RevisionPending({
  problem,
  onRetry,
}: RevisionPendingProps): JSX.Element {
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
        <p className="muted">
          Preparing your revision point from the reference note…
        </p>
      )}
    </section>
  );
}
