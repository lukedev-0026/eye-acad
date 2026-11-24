import { createMiddleware } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

import { getIdToken } from '../lib/id-token';
import { getFirebaseAdmin } from './firebase-admin.server';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Please sign in.');
    this.name = 'UnauthenticatedError';
  }
}

// Every server function that touches the case or an attempt uses this.
// Browser half: attach the signed-in user's Firebase ID token.
// Server half: verify it and pass the uid on. The uid is never taken from the
// request body, so one trainee cannot act as another.
export const requireUser = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const token = await getIdToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    const header = getRequestHeader('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthenticatedError();
    let uid: string;
    try {
      uid = (await getFirebaseAdmin().auth.verifyIdToken(token)).uid;
    } catch {
      throw new UnauthenticatedError();
    }
    return next({ context: { uid } });
  });
