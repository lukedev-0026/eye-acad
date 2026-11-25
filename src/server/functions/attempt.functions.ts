import { createServerFn } from '@tanstack/react-start';

import { startAttempt as startAttemptUseCase } from '@/application/attempt/start-attempt.use-case';
import { getContainer } from '@/application/container';
import { requireUser } from '@/server/middleware/auth.middleware';

export const startAttempt = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .handler(async ({ context }) => ({
    attemptId: await startAttemptUseCase(getContainer(), context.uid),
  }));
