import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

import { getPublicConfig } from '@/config/public-env';

// Project id must match the server's (firebase-admin.ts) or tokens fail.
const { firebase } = getPublicConfig();

const app =
  getApps()[0] ??
  initializeApp({
    projectId: firebase.projectId,
    apiKey: firebase.apiKey,
    authDomain: firebase.authDomain,
  });

export const auth = getAuth(app);
export const db = getFirestore(app);

// Hot reload re-runs this module and connecting twice throws, so check first.
if (firebase.useEmulators && !auth.emulatorConfig) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export const DEMO_ACCOUNTS = [
  { key: 'a', name: 'Trainee A', email: 'trainee.a@demo.test' },
  { key: 'b', name: 'Trainee B', email: 'trainee.b@demo.test' },
] as const;
export const DEMO_PASSWORD = 'demo-password';
