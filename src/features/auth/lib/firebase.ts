import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

import { getPublicConfig } from '@/config/public-env';

// Browser-side Firebase. The project id must match the server's
// (src/infrastructure/firestore/firebase-admin.ts), or ID tokens fail verification.
const { firebase } = getPublicConfig();
export const FIREBASE_PROJECT_ID = firebase.projectId;

const app =
  getApps()[0] ??
  initializeApp({ projectId: firebase.projectId, apiKey: firebase.apiKey, authDomain: firebase.authDomain });

export const auth = getAuth(app);
export const db = getFirestore(app);

// A `demo-` project id never talks to real Google services, so the app is
// pointed at the local emulators whenever one is in use. Connecting twice
// throws, and hot reload re-runs this module, so it asks first.
if (firebase.useEmulators && !auth.emulatorConfig) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Two fixed demo trainees, so privacy can be shown by signing in as the other.
// These exist only in the local emulator.
export const DEMO_ACCOUNTS = [
  { key: 'a', name: 'Trainee A', email: 'trainee.a@demo.test' },
  { key: 'b', name: 'Trainee B', email: 'trainee.b@demo.test' },
] as const;
export const DEMO_PASSWORD = 'demo-password';
