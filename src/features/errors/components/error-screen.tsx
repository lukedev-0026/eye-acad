import { Link, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import type { JSX } from 'react';

import { PublicError } from '@/common/errors/public.error';
import { messageFor } from '@/features/errors/lib/message-for';

// Shown when a page fails to load or render. Nothing about the failure itself
// is shown beyond a message written for the reader; the reference can be
// quoted to find the rest in the server's log.
export function ErrorScreen({ error }: ErrorComponentProps): JSX.Element {
  const router = useRouter();
  return (
    <main className="page narrow">
      <h1>Something went wrong</h1>
      <p className="lede">{messageFor(error, 'This page could not be shown. Please try again.')}</p>
      {error instanceof PublicError ? <p className="muted small">Reference: {error.requestId}</p> : null}
      <div className="row">
        <button className="button" onClick={() => void router.invalidate()}>
          Try again
        </button>
        <Link to="/" className="button quiet">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
