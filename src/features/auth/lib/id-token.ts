import { createIsomorphicFn } from '@tanstack/react-start';

import { auth } from './firebase';

// The signed-in trainee's Firebase ID token, for the browser to attach to a
// server call. On the server there is no signed-in browser user, so there is
// no token; the build drops the browser half, and the Firebase browser SDK
// with it, from the server bundle.
export const getIdToken = createIsomorphicFn()
  .client(async (): Promise<string | null> => (await auth.currentUser?.getIdToken()) ?? null)
  .server((): Promise<string | null> => Promise.resolve(null));
