import { createFileRoute } from '@tanstack/react-router';

import { AttemptsPage } from '@/features/attempts/components/attempts-page';

export const Route = createFileRoute('/_authed/attempts/')({
  component: AttemptsPage,
});
