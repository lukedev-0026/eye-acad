import { createIsomorphicFn } from '@tanstack/react-start';

import { auth } from './firebase';

/** Null on the server: the build drops the Firebase browser SDK from it. */
export const getIdToken = createIsomorphicFn()
  .client(
    async (): Promise<string | null> =>
      (await auth.currentUser?.getIdToken()) ?? null,
  )
  .server((): Promise<string | null> => Promise.resolve(null));
