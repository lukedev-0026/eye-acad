import { createServerFn } from '@tanstack/react-start';

import { startAttempt as startAttemptUseCase } from '@/application/attempt/start-attempt.use-case';
import { getContainer } from '@/application/container';
import { requireUser } from '@/server/middleware/auth.middleware';

// The browser's only way in is through server functions like this one. Each
// checks the caller's token first and takes the uid from that check, never
// from the request body.
//
// Server-only modules are imported in the ordinary way. When the browser
// bundle is built, each handler is replaced by a call to the server, and the
// imports only a handler used are dropped with it.

export const startAttempt = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .handler(async ({ context }) => ({ attemptId: await startAttemptUseCase(getContainer(), context.uid) }));
