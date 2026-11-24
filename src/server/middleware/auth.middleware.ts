import { createMiddleware } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

import { UnauthenticatedError } from '@/common/errors/auth.error';
import { annotateRequestContext } from '@/common/logging/request-context.server';
import { getIdToken } from '@/features/auth/lib/id-token';
import { getFirebaseAdmin } from '@/infrastructure/firestore/firebase-admin';

const BEARER = 'Bearer ';

// Every server function that touches the case or an attempt uses this.
// Browser half: attach the signed-in user's Firebase ID token.
// Server half: verify it and pass the uid on. The uid is never taken from the
// request body, so one trainee cannot act as another.
export const requireUser = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const token = await getIdToken();
    return next({ headers: token ? { Authorization: `${BEARER}${token}` } : {} });
  })
  .server(async ({ next }) => {
    const header = getRequestHeader('authorization') ?? '';
    const token = header.startsWith(BEARER) ? header.slice(BEARER.length) : '';
    if (!token) throw new UnauthenticatedError();
    let uid: string;
    try {
      uid = (await getFirebaseAdmin().auth.verifyIdToken(token)).uid;
    } catch (error) {
      // An expired, forged or foreign token. The reason is kept for the log.
      throw new UnauthenticatedError({ cause: error });
    }
    annotateRequestContext({ uid });
    return next({ context: { uid } });
  });
