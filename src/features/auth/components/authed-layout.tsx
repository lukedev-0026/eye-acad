import { Link, Navigate, Outlet } from '@tanstack/react-router';
import { signOut } from 'firebase/auth';
import type { JSX } from 'react';

import { useAuthUser } from '@/features/auth/hooks/use-auth';
import { auth } from '@/features/auth/lib/firebase';

// The frame around every signed-in page. A signed-out visitor is sent to the
// sign-in page before anything inside it is drawn.
export function AuthedLayout(): JSX.Element {
  const user = useAuthUser();
  if (user === undefined) return <p className="page muted">Loading…</p>;
  if (user === null) return <Navigate to="/" />;
  return (
    <>
      <header className="topbar">
        <Link to="/attempts" className="brand">
          Practice viva
        </Link>
        <span className="topbar-user">
          <span className="muted small">{user.email}</span>
          <button className="button quiet" onClick={() => void signOut(auth)}>
            Sign out
          </button>
        </span>
      </header>
      <Outlet />
    </>
  );
}
