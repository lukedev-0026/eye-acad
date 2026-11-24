import { createRouter as createTanStackRouter } from '@tanstack/react-router';

import { ErrorScreen } from '@/features/errors/components/error-screen';
import { NotFoundScreen } from '@/features/errors/components/not-found-screen';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorScreen,
    defaultNotFoundComponent: NotFoundScreen,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
