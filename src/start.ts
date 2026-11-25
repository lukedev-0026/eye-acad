import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

import { publicErrorAdapter } from '@/common/errors/public-error.adapter';
import { handleErrors } from '@/server/middleware/error.middleware';
import { requestContext } from '@/server/middleware/request-context.middleware';

const sameSiteOnly = createCsrfMiddleware({
  filter: ({ request }) =>
    request.method !== 'GET' && request.method !== 'HEAD',
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestContext, sameSiteOnly],
  functionMiddleware: [handleErrors],
  serializationAdapters: [publicErrorAdapter],
}));
