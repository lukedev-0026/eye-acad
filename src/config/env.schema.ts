import { z } from 'zod';

import { Secret } from './secret';


const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_FORMATS = ['pretty', 'json'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

const SPEECH_MODES = ['per-sentence', 'single'] as const;
export type SpeechMode = (typeof SPEECH_MODES)[number];

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

  LOG_LEVEL: optionalText.pipe(z.enum(LOG_LEVELS).optional()),
  LOG_FORMAT: optionalText.pipe(z.enum(LOG_FORMATS).optional()),

  OLLAMA_HOST: optionalText.pipe(z.url().default('http://127.0.0.1:11434')),
  OLLAMA_KEEP_ALIVE: optionalText.pipe(z.string().default('30m')),
  VIVA_EMBEDDING_MODEL: optionalText.pipe(z.string().default('nomic-embed-text')),

  DEEPGRAM_API_KEY: secret,
  VIVA_STT_MODEL: optionalText.pipe(z.string().default('nova-3-medical')),
  VIVA_TTS_VOICE: optionalText.pipe(z.string().default('aura-2-draco-en')),
  VIVA_SPEECH_MODE: optionalText.pipe(z.enum(SPEECH_MODES).default('per-sentence')),

  ANTHROPIC_API_KEY: secret,

  VITE_FIREBASE_PROJECT_ID: optionalText.pipe(z.string().default('demo-viva')),
  FIREBASE_AUTH_EMULATOR_HOST: optionalText,
  FIRESTORE_EMULATOR_HOST: optionalText,

  VIVA_CASE_FILE: optionalText.pipe(z.string().default('data/case-EA-VIVA-001.json')),
  VIVA_STEPS_FILE: optionalText.pipe(z.string().default('config/steps.json')),
  VIVA_NOTE_PDF: optionalText.pipe(z.string().default('data/reference-note.pdf')),
  VIVA_NOTE_INDEX: optionalText.pipe(z.string().default('data/note-index.json')),
});
