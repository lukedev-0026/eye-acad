import { randomUUID } from 'node:crypto';

import { createMiddleware } from '@tanstack/react-start';

import { runWithRequestContext } from '@/common/logging/request-context.server';

export const requestContext = createMiddleware().server(({ next }) =>
  runWithRequestContext({ requestId: randomUUID() }, () => next()),
);
