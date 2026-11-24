import { isNotFound, isRedirect } from '@tanstack/react-router';
import { createMiddleware } from '@tanstack/react-start';
import { setResponseStatus } from '@tanstack/react-start/server';

import { toPublicError } from '@/common/errors/public.error';
import { toAppError } from '@/common/errors/to-error';
import { getLogger } from '@/common/logging/logger.server';
import { annotateRequestContext, currentRequestContext } from '@/common/logging/request-context.server';

const MAX_ID_CHARS = 64;

// The attempt a call is about, if its request names one. For the log only.
function attemptIdIn(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('attemptId' in data)) return undefined;
  return typeof data.attemptId === 'string' ? data.attemptId.slice(0, MAX_ID_CHARS) : undefined;
}

// Wraps every server function. It is registered once, in src/start.ts.
//
// Left alone, the framework sends a thrown error to the browser as data in an
// HTTP 200 reply, keeps only its message, and logs nothing. So this:
//   - writes one line per call: which function, how long, how it ended;
//   - logs a failure once, with its whole chain of causes;
//   - sets the HTTP status the error names;
//   - sends the browser a PublicError: a code, a message that is safe to
//     show, and the request id. Nothing else about the failure leaves the server.
export const handleErrors = createMiddleware({ type: 'function' }).server(async ({ next, serverFnMeta, data }) => {
  const started = performance.now();
  const log = getLogger('server');
  const functionName = serverFnMeta.name;
  annotateRequestContext({ functionName, attemptId: attemptIdIn(data) });
  const durationMs = (): number => Math.round(performance.now() - started);

  try {
    const result = await next();
    log.info({ actionResult: 'SUCCESS', durationMs: durationMs() }, 'serverFunction.completed');
    return result;
  } catch (thrown) {
    // A redirect or a "not found" is the framework's own signalling, not a failure.
    if (thrown instanceof Response || isRedirect(thrown) || isNotFound(thrown)) throw thrown;

    const error = toAppError(thrown);
    const context = {
      actionResult: 'FAILED',
      code: error.code,
      status: error.status,
      durationMs: durationMs(),
      err: error,
    };
    // A refused request is the caller's doing; anything else is ours to look at.
    if (error.status >= 500) log.error(context, 'serverFunction.failed');
    else log.warn(context, 'serverFunction.refused');

    setResponseStatus(error.status);
    throw toPublicError(error, currentRequestContext()?.requestId ?? 'unknown');
  }
});
