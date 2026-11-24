import { createFileRoute } from '@tanstack/react-router';

import { AuthedLayout } from '@/features/auth/components/authed-layout';

// Everything under this layout needs a signed-in trainee. It is rendered in
// the browser only, so a signed-out request receives no case content at all.
// This is for navigation; the real protection is the token check on every
// server function and the Firestore rules.
export const Route = createFileRoute('/_authed')({
  ssr: false,
  component: AuthedLayout,
});
