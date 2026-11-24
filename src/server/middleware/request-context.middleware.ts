import { randomUUID } from 'node:crypto';

import { createMiddleware } from '@tanstack/react-start';

import { runWithRequestContext } from '@/common/logging/request-context.server';

// Runs for every request the server receives. It gives the request an id and
// opens the context the logger reads, so every line written while serving it
// can be found again by that id.
export const requestContext = createMiddleware().server(({ next }) =>
  runWithRequestContext({ requestId: randomUUID() }, () => next()),
);
