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

/** The project id must match the browser's or verifyIdToken rejects tokens. */
export function getFirebaseAdmin(): FirebaseAdmin {
  if (cached) return cached;
  const { firebase } = getConfig();
  exportEmulatorEnvironment(firebase);
  const app = getApps()[0] ?? initializeApp({ projectId: firebase.projectId });
  cached = { auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
