import { isNotFound, isRedirect } from '@tanstack/react-router';
import { createMiddleware } from '@tanstack/react-start';
import { setResponseStatus } from '@tanstack/react-start/server';

import { toPublicError } from '@/common/errors/public.error';
import { toAppError } from '@/common/errors/to-error';
import { getLogger } from '@/common/logging/logger.server';
import {
  annotateRequestContext,
  currentRequestContext,
} from '@/common/logging/request-context.server';

const MAX_ID_CHARS = 64;

function attemptIdIn(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('attemptId' in data))
    return undefined;
  return typeof data.attemptId === 'string'
    ? data.attemptId.slice(0, MAX_ID_CHARS)
    : undefined;
}

/** Without this the framework returns errors as HTTP 200 data. Logs each
 *  failure once and sends only a PublicError (code, safe message, id). */
export const handleErrors = createMiddleware({ type: 'function' }).server(
  async ({ next, serverFnMeta, data }) => {
    const started = performance.now();
    const log = getLogger('server');
    const functionName = serverFnMeta.name;
    annotateRequestContext({ functionName, attemptId: attemptIdIn(data) });
    const durationMs = (): number => Math.round(performance.now() - started);

    try {
      const result = await next();
      log.info(
        { actionResult: 'SUCCESS', durationMs: durationMs() },
        'serverFunction.completed',
      );
      return result;
    } catch (thrown) {
      // Redirects and "not found" are framework signalling, not failures.
      if (
        thrown instanceof Response ||
        isRedirect(thrown) ||
        isNotFound(thrown)
      )
        throw thrown;

      const error = toAppError(thrown);
      const context = {
        actionResult: 'FAILED',
        code: error.code,
        status: error.status,
        durationMs: durationMs(),
        err: error,
      };
      if (error.status >= 500) log.error(context, 'serverFunction.failed');
      else log.warn(context, 'serverFunction.refused');

      setResponseStatus(error.status);
      throw toPublicError(
        error,
        currentRequestContext()?.requestId ?? 'unknown',
      );
    }
  },
);
