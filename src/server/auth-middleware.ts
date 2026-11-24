import { createMiddleware } from '@tanstack/react-start'

export class UnauthenticatedError extends Error {
  constructor() {
    super('Please sign in.')
    this.name = 'UnauthenticatedError'
  }
}

// Every server function that touches the case or an attempt uses this.
// Browser half: attach the signed-in user's Firebase ID token.
// Server half: verify it and pass the uid on. The uid is never taken from the
// request body, so one trainee cannot act as another.
export const requireUser = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    // `.client()` also runs during server rendering, where there is no user.
    if (typeof window === 'undefined') return next()
    const { auth } = await import('../lib/firebase')
    const token = await auth.currentUser?.getIdToken()
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} })
  })
  .server(async ({ next }) => {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    const { adminAuth } = await import('./firebase-admin.server')
    const header = getRequestHeader('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthenticatedError()
    let uid: string
    try {
      uid = (await adminAuth.verifyIdToken(token)).uid
    } catch {
      throw new UnauthenticatedError()
    }
    return next({ context: { uid } })
  })
