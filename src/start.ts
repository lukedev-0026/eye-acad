import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

import { publicErrorAdapter } from '@/common/errors/public-error.adapter';
import { handleErrors } from '@/server/middleware/error.middleware';
import { requestContext } from '@/server/middleware/request-context.middleware';

// Requests that change anything must come from this site's own pages.
const sameSiteOnly = createCsrfMiddleware({
  filter: ({ request }) => request.method !== 'GET' && request.method !== 'HEAD',
});

export const startInstance = createStart(() => ({
  // Every request: an id for the log first, then the same-site check.
  requestMiddleware: [requestContext, sameSiteOnly],
  // Every server function: errors logged, given a status and made safe to send.
  functionMiddleware: [handleErrors],
  // Lets that safe error reach the browser whole, not as a bare message.
  serializationAdapters: [publicErrorAdapter],
}));
