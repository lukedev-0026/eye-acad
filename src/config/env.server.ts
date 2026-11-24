import { existsSync } from 'node:fs';
import path from 'node:path';

import { errorMessage } from '@/common/errors/to-error';

import { InvalidEnvironmentError } from './config.error';
import { EnvSchema } from './env.schema';
import type { LogFormat, LogLevel, SpeechMode } from './env.schema';
import type { Secret } from './secret';

// The one place the server's environment is read. Everything else is handed
// this object, already checked, with every default filled in.

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly logging: {
    readonly level: LogLevel;
    // False when LOG_LEVEL was not set and `level` is the default.
    readonly levelWasSet: boolean;
    readonly format: LogFormat;
  };
  readonly ollama: {
    // No trailing slash.
    readonly host: string;
    readonly keepAlive: string;
  };
  readonly embeddings: {
    readonly model: string;
  };
  readonly deepgram: {
    readonly apiKey: Secret | null;
    // Tried in order: the medical model, then the general one if it refuses.
    readonly sttModels: ReadonlyArray<string>;
    readonly ttsVoice: string;
    readonly speechMode: SpeechMode;
  };
  readonly anthropic: {
    readonly apiKey: Secret | null;
  };
  readonly firebase: {
    readonly projectId: string;
    readonly useEmulators: boolean;
    readonly authEmulatorHost: string | null;
    readonly firestoreEmulatorHost: string | null;
  };
  // Absolute paths.
  readonly files: {
    readonly caseFile: string;
    readonly stepsFile: string;
    readonly notePdf: string;
    readonly noteIndex: string;
  };
}

const GENERAL_STT_MODEL = 'nova-3';
const DEFAULT_AUTH_EMULATOR = '127.0.0.1:9099';
const DEFAULT_FIRESTORE_EMULATOR = '127.0.0.1:8080';

export type EnvSource = Readonly<Record<string, string | undefined>>;

// Pure: the same source always gives the same config, or the same error
// listing every problem at once.
export function loadConfig(source: EnvSource, projectDir: string = process.cwd()): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new InvalidEnvironmentError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const env = parsed.data;
  const resolve = (file: string): string => path.resolve(projectDir, file);
  const useEmulators = env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-');

  return {
    nodeEnv: env.NODE_ENV,
    logging: {
      level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
      levelWasSet: env.LOG_LEVEL !== undefined,
      format: env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty'),
    },
    ollama: {
      host: env.OLLAMA_HOST.replace(/\/$/, ''),
      keepAlive: env.OLLAMA_KEEP_ALIVE,
    },
    embeddings: { model: env.VIVA_EMBEDDING_MODEL },
    deepgram: {
      apiKey: env.DEEPGRAM_API_KEY,
      sttModels: [env.VIVA_STT_MODEL, GENERAL_STT_MODEL],
      ttsVoice: env.VIVA_TTS_VOICE,
      speechMode: env.VIVA_SPEECH_MODE,
    },
    anthropic: { apiKey: env.ANTHROPIC_API_KEY },
    firebase: {
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      useEmulators,
      authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST ?? (useEmulators ? DEFAULT_AUTH_EMULATOR : null),
      firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST ?? (useEmulators ? DEFAULT_FIRESTORE_EMULATOR : null),
    },
    files: {
      caseFile: resolve(env.VIVA_CASE_FILE),
      stepsFile: resolve(env.VIVA_STEPS_FILE),
      notePdf: resolve(env.VIVA_NOTE_PDF),
      noteIndex: resolve(env.VIVA_NOTE_INDEX),
    },
  };
}

// Keys live in .env.local, which git ignores. The dev server has already
// loaded it by the time this runs; the command-line tools have not, so it is
// loaded here. A variable that is already set is never overwritten. Tests run
// on defaults alone, so that none can reach a real service.
function loadLocalEnvFile(projectDir: string): void {
  const file = path.join(projectDir, '.env.local');
  if (process.env.NODE_ENV === 'test' || !existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (error) {
    throw new InvalidEnvironmentError([`.env.local could not be read: ${errorMessage(error)}`], { cause: error });
  }
}

let cached: AppConfig | undefined;

// Read on first use, never when a module loads: the framework requires that,
// and a script can then fail with a clear message before doing any work.
export function getConfig(): AppConfig {
  if (!cached) {
    loadLocalEnvFile(process.cwd());
    cached = loadConfig(process.env);
  }
  return cached;
}

// For tests that change the environment.
export function resetConfig(): void {
  cached = undefined;
}
