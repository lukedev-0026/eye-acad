import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

export interface FirebaseAdmin {
  readonly auth: Auth;
  readonly db: Firestore;
}

let cached: FirebaseAdmin | undefined;

// The Admin SDK, set up on first use. Nothing happens when this file is merely
// imported.
export function getFirebaseAdmin(): FirebaseAdmin {
  if (cached) return cached;

  // Must equal the browser's project id (src/features/auth/lib/firebase.ts): verifyIdToken
  // rejects a token issued for any other project.
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-viva';

  // With a `demo-` project the Admin SDK is pointed at the local emulators and
  // needs no service-account key. A real project must set these itself.
  if (projectId.startsWith('demo-')) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    // Without these the first database call spends about three seconds looking
    // for Google Cloud credentials that a local emulator does not need.
    process.env.GOOGLE_CLOUD_PROJECT ??= projectId;
    process.env.METADATA_SERVER_DETECTION ??= 'none';
  }

  const app = getApps()[0] ?? initializeApp({ projectId });
  cached = { auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
