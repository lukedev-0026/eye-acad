import type { AppConfig } from './env.server';

// The Firebase Admin SDK finds the local emulators only through environment
// variables: it offers no other way to point its Auth client at one. This is
// the one place the project writes to the environment, and it writes only
// what the config already decided.
//
// With a `demo-` project the Admin SDK then needs no service-account key. A
// real project is left alone.
export function exportEmulatorEnvironment(firebase: AppConfig['firebase']): void {
  if (!firebase.useEmulators) return;
  if (firebase.authEmulatorHost) process.env.FIREBASE_AUTH_EMULATOR_HOST = firebase.authEmulatorHost;
  if (firebase.firestoreEmulatorHost) process.env.FIRESTORE_EMULATOR_HOST = firebase.firestoreEmulatorHost;
  // Without these the first database call spends about three seconds looking
  // for Google Cloud credentials that a local emulator does not need.
  process.env.GOOGLE_CLOUD_PROJECT ??= firebase.projectId;
  process.env.METADATA_SERVER_DETECTION ??= 'none';
}
