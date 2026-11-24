import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { DEMO_ACCOUNTS, DEMO_PASSWORD, auth } from '../lib/firebase';
import { useAuthUser } from '../lib/use-auth';

// Rendered in the browser only: sign-in state lives in the browser, and
// nothing about the case is on this page.
export const Route = createFileRoute('/')({ ssr: false, component: SignIn });

function SignIn() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) void navigate({ to: '/attempts' });
  }, [user, navigate]);

  async function signIn(email: string) {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, DEMO_PASSWORD);
    } catch {
      // First use on a fresh emulator: the demo account does not exist yet.
      try {
        await createUserWithEmailAndPassword(auth, email, DEMO_PASSWORD);
      } catch {
        setError('Could not sign in. Are the Firebase emulators running? (pnpm emulators)');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <h1>Practice viva</h1>
      <p className="lede">
        A spoken practice exam on one fictional eye casualty case. Sign in to start or to reopen an earlier attempt.
      </p>
      <div className="stack">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.key}
            className="button primary"
            disabled={busy || user === undefined}
            onClick={() => void signIn(account.email)}
          >
            Sign in as {account.name}
          </button>
        ))}
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="muted small">
        Demo accounts in a local Firebase emulator. Each trainee can see only their own attempts.
      </p>
    </main>
  );
}
