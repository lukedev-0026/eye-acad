import { z } from 'zod';

import { Secret } from './secret';

// The environment variables this project reads, and what each becomes. Every
// one is optional: a fresh clone with no env file runs against the local
// emulators and a local Ollama, by typing, with no key at all.

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_FORMATS = ['pretty', 'json'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

const SPEECH_MODES = ['per-sentence', 'single'] as const;
export type SpeechMode = (typeof SPEECH_MODES)[number];

// An unset variable and an empty one mean the same thing: use the default.
const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const secret = optionalText.transform((value) => (value ? new Secret(value) : null));

export const EnvSchema = z.object({
  NODE_ENV: optionalText.pipe(z.enum(['development', 'test', 'production']).default('development')),

  // Logging. Unset, the level is "info" (and silent under test), and lines are
  // human-readable except in production.
  LOG_LEVEL: optionalText.pipe(z.enum(LOG_LEVELS).optional()),
  LOG_FORMAT: optionalText.pipe(z.enum(LOG_FORMATS).optional()),

  // Local language models.
  OLLAMA_HOST: optionalText.pipe(z.url().default('http://127.0.0.1:11434')),
  OLLAMA_KEEP_ALIVE: optionalText.pipe(z.string().default('30m')),
  VIVA_EMBEDDING_MODEL: optionalText.pipe(z.string().default('nomic-embed-text')),

  // Speech. Without the key the app still works by typing.
  DEEPGRAM_API_KEY: secret,
  VIVA_STT_MODEL: optionalText.pipe(z.string().default('nova-3-medical')),
  VIVA_TTS_VOICE: optionalText.pipe(z.string().default('aura-2-draco-en')),
  // "single" restores the first version (one request for a whole reply,
  // nothing kept), so the two can be timed side by side.
  VIVA_SPEECH_MODE: optionalText.pipe(z.enum(SPEECH_MODES).default('per-sentence')),

  // Only read if a step is switched to the Claude provider.
  ANTHROPIC_API_KEY: secret,

  // Firebase. A project id starting "demo-" never talks to Google: the app is
  // pointed at the local emulators.
  VITE_FIREBASE_PROJECT_ID: optionalText.pipe(z.string().default('demo-viva')),
  FIREBASE_AUTH_EMULATOR_HOST: optionalText,
  FIRESTORE_EMULATOR_HOST: optionalText,

  // Files, relative to the project folder unless absolute.
  VIVA_CASE_FILE: optionalText.pipe(z.string().default('data/case-EA-VIVA-001.json')),
  VIVA_STEPS_FILE: optionalText.pipe(z.string().default('config/steps.json')),
  VIVA_NOTE_PDF: optionalText.pipe(z.string().default('data/reference-note.pdf')),
  VIVA_NOTE_INDEX: optionalText.pipe(z.string().default('data/note-index.json')),
});
