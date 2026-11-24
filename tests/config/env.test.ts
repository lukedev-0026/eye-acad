import path from 'node:path';
import { inspect } from 'node:util';

import { assert, describe, expect, it } from 'vitest';

import { InvalidEnvironmentError } from '@/config/config.error';
import { loadConfig } from '@/config/env.server';
import { loadPublicConfig } from '@/config/public-env';
import { Secret } from '@/config/secret';

const PROJECT = '/project';

describe('loadConfig', () => {
  it('runs on nothing at all: every variable has a default', () => {
    const config = loadConfig({}, PROJECT);

    expect(config.nodeEnv).toBe('development');
    expect(config.logging).toEqual({ level: 'info', levelWasSet: false, format: 'pretty' });
    expect(config.ollama).toEqual({ host: 'http://127.0.0.1:11434', keepAlive: '30m' });
    expect(config.embeddings.model).toBe('nomic-embed-text');
    expect(config.deepgram).toEqual({
      apiKey: null,
      sttModels: ['nova-3-medical', 'nova-3'],
      ttsVoice: 'aura-2-draco-en',
      speechMode: 'per-sentence',
    });
    expect(config.anthropic.apiKey).toBeNull();
    expect(config.firebase).toEqual({
      projectId: 'demo-viva',
      useEmulators: true,
      authEmulatorHost: '127.0.0.1:9099',
      firestoreEmulatorHost: '127.0.0.1:8080',
    });
    expect(config.files).toEqual({
      caseFile: path.join(PROJECT, 'data/case-EA-VIVA-001.json'),
      stepsFile: path.join(PROJECT, 'config/steps.json'),
      notePdf: path.join(PROJECT, 'data/reference-note.pdf'),
      noteIndex: path.join(PROJECT, 'data/note-index.json'),
    });
  });

  it('treats an empty variable as unset, as the example env file leaves the key', () => {
    const config = loadConfig({ DEEPGRAM_API_KEY: '', OLLAMA_HOST: '   ' }, PROJECT);

    expect(config.deepgram.apiKey).toBeNull();
    expect(config.ollama.host).toBe('http://127.0.0.1:11434');
  });

  it('takes overrides', () => {
    const config = loadConfig(
      {
        NODE_ENV: 'production',
        LOG_LEVEL: 'debug',
        OLLAMA_HOST: 'http://ollama.internal:11434/',
        OLLAMA_KEEP_ALIVE: '5m',
        VIVA_STT_MODEL: 'nova-3',
        VIVA_TTS_VOICE: 'aura-2-pandora-en',
        VIVA_SPEECH_MODE: 'single',
        VIVA_CASE_FILE: '/elsewhere/case.json',
        VIVA_STEPS_FILE: 'config/steps.small.json',
      },
      PROJECT,
    );

    expect(config.logging).toEqual({ level: 'debug', levelWasSet: true, format: 'json' });
    expect(config.ollama).toEqual({ host: 'http://ollama.internal:11434', keepAlive: '5m' });
    expect(config.deepgram.sttModels).toEqual(['nova-3', 'nova-3']);
    expect(config.deepgram.ttsVoice).toBe('aura-2-pandora-en');
    expect(config.deepgram.speechMode).toBe('single');
    expect(config.files.caseFile).toBe('/elsewhere/case.json');
    expect(config.files.stepsFile).toBe(path.join(PROJECT, 'config/steps.small.json'));
  });

  it('is silent under test unless a level is asked for', () => {
    expect(loadConfig({ NODE_ENV: 'test' }, PROJECT).logging.level).toBe('silent');
    expect(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'warn' }, PROJECT).logging.level).toBe('warn');
  });

  it('leaves the emulators alone for a real project', () => {
    const config = loadConfig({ VITE_FIREBASE_PROJECT_ID: 'eye-academy-prod' }, PROJECT);

    expect(config.firebase).toEqual({
      projectId: 'eye-academy-prod',
      useEmulators: false,
      authEmulatorHost: null,
      firestoreEmulatorHost: null,
    });
  });

  it('reports every invalid value at once, by name', () => {
    const load = () => loadConfig({ LOG_LEVEL: 'loud', OLLAMA_HOST: 'not a url', VIVA_SPEECH_MODE: 'fast' }, PROJECT);

    expect(load).toThrow(InvalidEnvironmentError);
    try {
      load();
    } catch (error) {
      const message = (error as InvalidEnvironmentError).message;
      expect(message).toContain('LOG_LEVEL');
      expect(message).toContain('OLLAMA_HOST');
      expect(message).toContain('VIVA_SPEECH_MODE');
      expect((error as InvalidEnvironmentError).code).toBe('CONFIG_INVALID');
    }
  });

  it('wraps a key so that it cannot be printed by accident', () => {
    const config = loadConfig({ DEEPGRAM_API_KEY: 'dg-very-secret' }, PROJECT);
    const key = config.deepgram.apiKey;

    assert(key instanceof Secret);
    expect(key.reveal()).toBe('dg-very-secret');
    expect(String(key)).toBe('[REDACTED]');
    expect(`${key}`).toBe('[REDACTED]');
    expect(JSON.stringify(config)).not.toContain('dg-very-secret');
    expect(inspect(config, { depth: 5 })).not.toContain('dg-very-secret');
  });
});

describe('loadPublicConfig', () => {
  it('defaults to the local demo project and its emulators', () => {
    expect(loadPublicConfig({})).toEqual({
      firebase: {
        projectId: 'demo-viva',
        apiKey: 'demo-api-key',
        authDomain: 'demo-viva.firebaseapp.com',
        useEmulators: true,
      },
    });
  });

  it('uses a real project when one is named', () => {
    const config = loadPublicConfig({ VITE_FIREBASE_PROJECT_ID: 'eye-academy-prod', VITE_FIREBASE_API_KEY: 'k' });

    expect(config.firebase).toEqual({
      projectId: 'eye-academy-prod',
      apiKey: 'k',
      authDomain: 'eye-academy-prod.firebaseapp.com',
      useEmulators: false,
    });
  });
});
