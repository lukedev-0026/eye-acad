import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { exportEmulatorEnvironment } from '@/config/emulator-environment.server';
import { getConfig } from '@/config/env.server';

export interface FirebaseAdmin {
  readonly auth: Auth;
  readonly db: Firestore;
}

let cached: FirebaseAdmin | undefined;

// The Admin SDK, set up on first use. Nothing happens when this file is merely
// imported.
//
// The project id must equal the browser's (src/features/auth/lib/firebase.ts):
// verifyIdToken rejects a token issued for any other project.
export function getFirebaseAdmin(): FirebaseAdmin {
  if (cached) return cached;
  const { firebase } = getConfig();
  exportEmulatorEnvironment(firebase);
  const app = getApps()[0] ?? initializeApp({ projectId: firebase.projectId });
  cached = { auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
