import { createFileRoute } from '@tanstack/react-router';

import { AuthedLayout } from '@/features/auth/components/authed-layout';

export const Route = createFileRoute('/_authed')({
  ssr: false,
  component: AuthedLayout,
});
