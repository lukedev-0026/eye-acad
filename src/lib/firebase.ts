import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// Browser-side Firebase. The project id must match the server's
// (src/server/firebase-admin.server.ts), or ID tokens fail verification.
export const FIREBASE_PROJECT_ID =
  import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-viva'

// A `demo-` project id never talks to real Google services, so the app is
// pointed at the local emulators whenever one is in use.
const useEmulators = FIREBASE_PROJECT_ID.startsWith('demo-')

const app =
  getApps()[0] ??
  initializeApp({
    projectId: FIREBASE_PROJECT_ID,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
    authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  })

export const auth = getAuth(app)
export const db = getFirestore(app)

// Connecting twice throws, and hot reload re-runs this module.
const flag = globalThis as { __vivaEmulatorsConnected?: boolean }
if (useEmulators && !flag.__vivaEmulatorsConnected) {
  flag.__vivaEmulatorsConnected = true
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

// Two fixed demo trainees, so privacy can be shown by signing in as the other.
// These exist only in the local emulator.
export const DEMO_ACCOUNTS = [
  { key: 'a', name: 'Trainee A', email: 'trainee.a@demo.test' },
  { key: 'b', name: 'Trainee B', email: 'trainee.b@demo.test' },
] as const
export const DEMO_PASSWORD = 'demo-password'
