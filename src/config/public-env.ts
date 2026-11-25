import { z } from 'zod';

// Vite ships every VITE_ variable to the browser: never use it for a secret.

const PublicEnvSchema = z.object({
  VITE_FIREBASE_PROJECT_ID: z.string().min(1).default('demo-viva'),
  VITE_FIREBASE_API_KEY: z.string().min(1).default('demo-api-key'),
});

export interface PublicConfig {
  readonly firebase: {
    readonly projectId: string;
    readonly apiKey: string;
    readonly authDomain: string;
    readonly useEmulators: boolean;
  };
}

export function loadPublicConfig(source: Readonly<Record<string, unknown>>): PublicConfig {
  const env = PublicEnvSchema.parse({
    VITE_FIREBASE_PROJECT_ID: source.VITE_FIREBASE_PROJECT_ID || undefined,
    VITE_FIREBASE_API_KEY: source.VITE_FIREBASE_API_KEY || undefined,
  });
  return {
    firebase: {
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      useEmulators: env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-'),
    },
  };
}

let cached: PublicConfig | undefined;

export function getPublicConfig(): PublicConfig {
  cached ??= loadPublicConfig(import.meta.env);
  return cached;
}
