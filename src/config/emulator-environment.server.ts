import type { AppConfig } from './env.server';

export function exportEmulatorEnvironment(firebase: AppConfig['firebase']): void {
  if (!firebase.useEmulators) return;
  if (firebase.authEmulatorHost) process.env.FIREBASE_AUTH_EMULATOR_HOST = firebase.authEmulatorHost;
  if (firebase.firestoreEmulatorHost) process.env.FIRESTORE_EMULATOR_HOST = firebase.firestoreEmulatorHost;
  // Without these the first database call spends ~3 s seeking credentials.
  process.env.GOOGLE_CLOUD_PROJECT ??= firebase.projectId;
  process.env.METADATA_SERVER_DETECTION ??= 'none';
}
