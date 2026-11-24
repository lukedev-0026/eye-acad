import { createFileRoute } from '@tanstack/react-router';

import { AttemptPage } from '@/features/viva/components/attempt-page';

export const Route = createFileRoute('/_authed/attempts/$attemptId')({
  component: AttemptRoute,
});

function AttemptRoute() {
  const { attemptId } = Route.useParams();
  return <AttemptPage attemptId={attemptId} />;
}
