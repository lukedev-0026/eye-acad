import { Link, Navigate, Outlet, createFileRoute } from '@tanstack/react-router';
import { signOut } from 'firebase/auth';

import { useAuthUser } from '@/features/auth/hooks/use-auth';
import { auth } from '@/features/auth/lib/firebase';

// Everything under this layout needs a signed-in trainee. It is rendered in
// the browser only, so a signed-out request receives no case content at all.
// This is for navigation; the real protection is the token check on every
// server function and the Firestore rules.
export const Route = createFileRoute('/_authed')({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
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
