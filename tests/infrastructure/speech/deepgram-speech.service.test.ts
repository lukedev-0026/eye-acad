import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '@/config/env.server';
import { Secret } from '@/config/secret';
import {
  DeepgramSpeechService,
  MAX_AUDIO_BYTES,
  createSpeechService,
} from '@/infrastructure/speech/deepgram-speech.service';
import type { DeepgramOptions } from '@/infrastructure/speech/deepgram-speech.service';
import { NullSpeechService } from '@/infrastructure/speech/null-speech.service';
import { fakeFetch, json } from '@tests/fakes/fake-fetch';
import type { SentRequest } from '@tests/fakes/fake-fetch';

const service = (options: Partial<DeepgramOptions> = {}) =>
  new DeepgramSpeechService({
    apiKey: new Secret('test-key'),
    sttModels: ['nova-3-medical', 'nova-3'],
    ttsVoice: 'aura-2-draco-en',
    speechMode: 'per-sentence',
    ...options,
  });

const heard = (transcript: string) => json({ results: { channels: [{ alternatives: [{ transcript }] }] } });
const audio = (text: string) => new Response(Buffer.from(`mp3:${text}`));
const isSpeak = (request: SentRequest) => new URL(request.url).pathname === '/v1/speak';
const spokenText = (request: SentRequest) => (request.body as { text: string }).text;
const asText = (base64: string) => Buffer.from(base64, 'base64').toString();

afterEach(() => vi.unstubAllGlobals());

describe('turning speech into text', () => {
  it('asks the medical model first, in British English, with the names of the findings as hints', async () => {
    const sent = fakeFetch(() => heard('  what is the pressure in the right eye  '));

    const result = await service().transcribe(new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus', [
      'Intraocular pressure',
      'Gonioscopy',
    ]);
    const url = new URL(sent[0]?.url ?? '');

    expect(result).toMatchObject({ ok: true, text: 'what is the pressure in the right eye', model: 'nova-3-medical' });
    expect(sent).toHaveLength(1);
    expect(url.origin + url.pathname).toBe('https://api.deepgram.com/v1/listen');
    expect(url.searchParams.get('model')).toBe('nova-3-medical');
    expect(url.searchParams.get('language')).toBe('en-GB');
    expect(url.searchParams.get('smart_format')).toBe('true');
    expect(url.searchParams.getAll('keyterm')).toEqual(['Intraocular pressure', 'Gonioscopy']);
    expect(sent[0]?.headers).toMatchObject({ authorization: 'Token test-key', 'content-type': 'audio/webm' });
    // The key goes in a header, never in the address.
    expect(sent[0]?.url).not.toContain('test-key');
  });

  it('sends at most sixty hints', async () => {
    const sent = fakeFetch(() => heard('x'));

    await service().transcribe(
      new Uint8Array([1]),
      'audio/webm',
      Array.from({ length: 80 }, (_, i) => `term ${i}`),
    );

    expect(new URL(sent[0]?.url ?? '').searchParams.getAll('keyterm')).toHaveLength(60);
  });

  it('falls back to the general model when the medical one refuses the request', async () => {
    const sent = fakeFetch((request) =>
      request.url.includes('model=nova-3-medical') ? json({ err_msg: 'keyterm not supported' }, 400) : heard('hello'),
    );

    const result = await service().transcribe(new Uint8Array([1]), 'audio/webm', []);

    expect(sent).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, text: 'hello', model: 'nova-3' });
  });

  it('says which model failed last, and how, when none could transcribe', async () => {
    fakeFetch((request) =>
      request.url.includes('model=nova-3-medical')
        ? json({ err_msg: 'bad request' }, 400)
        : Promise.reject(new TypeError('fetch failed')),
    );

    const result = await service().transcribe(new Uint8Array([1]), 'audio/webm', []);

    expect(result).toMatchObject({ ok: false, error: 'nova-3: TypeError: fetch failed' });
  });

  it('gives an empty transcript for silence, not an error', async () => {
    fakeFetch(() => json({ results: { channels: [] } }));

    expect(await service().transcribe(new Uint8Array([1]), 'audio/webm', [])).toMatchObject({ ok: true, text: '' });
  });

  it('refuses a recording that is too long without sending it', async () => {
    const sent = fakeFetch(() => heard('x'));

    const result = await service().transcribe(new Uint8Array(MAX_AUDIO_BYTES + 1), 'audio/webm', []);

    expect(result).toEqual({ ok: false, ms: 0, error: 'Recording too long.' });
    expect(sent).toHaveLength(0);
  });
});

describe('turning text into speech', () => {
  it('asks for one MP3 clip per sentence group, all at once, and returns them in order', async () => {
    const sent = fakeFetch((request) => audio(spokenText(request)));

    const reply = await service().speak(['Right eye, fifty-eight.', '  ', 'Left eye, eighteen.']);
    const url = new URL(sent[0]?.url ?? '');

    expect(sent.filter(isSpeak)).toHaveLength(2);
    expect(url.searchParams.get('model')).toBe('aura-2-draco-en');
    expect(url.searchParams.get('encoding')).toBe('mp3');
    expect(sent[0]?.headers).toMatchObject({ authorization: 'Token test-key', 'content-type': 'application/json' });
    expect(reply?.clips.map((clip) => asText(clip.audioBase64))).toEqual([
      'mp3:Right eye, fifty-eight.',
      'mp3:Left eye, eighteen.',
    ]);
    expect(reply).toMatchObject({ voice: 'aura-2-draco-en', fromCache: 0 });
    expect(reply?.clips.map((clip) => clip.mimeType)).toEqual(['audio/mpeg', 'audio/mpeg']);
  });

  it('keeps each clip, so a sentence already said is not asked for again', async () => {
    const sent = fakeFetch((request) => audio(spokenText(request)));
    const voice = service();

    await voice.speak(['Right eye, fifty-eight.']);
    const again = await voice.speak(['Right eye, fifty-eight.', 'Left eye, eighteen.']);

    expect(sent.filter(isSpeak).map(spokenText)).toEqual(['Right eye, fifty-eight.', 'Left eye, eighteen.']);
    expect(again?.fromCache).toBe(1);
    expect(voice.heldCount).toBe(2);
  });

  it('says nothing at all if any part cannot be made', async () => {
    fakeFetch((request) =>
      spokenText(request).startsWith('Left') ? new Response('quota exceeded', { status: 429 }) : audio('ok'),
    );
    const voice = service();

    expect(await voice.speak(['Right eye, fifty-eight.', 'Left eye, eighteen.'])).toBeNull();
    expect(voice.lastError).toBe('HTTP 429 quota exceeded');
  });

  it('says nothing, and asks for nothing, when there is nothing to say', async () => {
    const sent = fakeFetch(() => audio('x'));

    expect(await service().speak(['', '   '])).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('records why a request failed when the service cannot be reached', async () => {
    fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
    const voice = service();

    expect(await voice.synthesise('Hello.')).toBeNull();
    expect(voice.lastError).toBe('TypeError: fetch failed');
  });

  it('makes clips ahead of time in the background, so the reply itself does not wait', async () => {
    const sent = fakeFetch((request) => audio(spokenText(request)));
    const voice = service();

    voice.prepare(['One.', 'Two.', 'Three.', 'Four.', 'One.', '  ']);
    await vi.waitFor(() => {
      expect(voice.heldCount).toBe(4);
    });
    const reply = await voice.speak(['Two.', 'Four.']);

    expect(sent.filter(isSpeak)).toHaveLength(4);
    expect(reply).toMatchObject({ fromCache: 2 });
  });

  it('in single mode makes one clip for the whole reply and keeps nothing', async () => {
    const sent = fakeFetch((request) => audio(spokenText(request)));
    const voice = service({ speechMode: 'single' });

    voice.prepare(['One.', 'Two.']);
    const reply = await voice.speak(['One.', 'Two.']);

    expect(sent.filter(isSpeak).map(spokenText)).toEqual(['One. Two.']);
    expect(reply?.clips).toHaveLength(1);
    expect(reply?.fromCache).toBe(0);
    expect(voice.heldCount).toBe(0);
  });
});

describe('choosing the speech service', () => {
  it('uses Deepgram when there is a key', () => {
    const speech = createSpeechService(loadConfig({ DEEPGRAM_API_KEY: 'dg-key' }).deepgram);

    expect(speech).toBeInstanceOf(DeepgramSpeechService);
    expect(speech.available).toBe(true);
  });

  it('is silent when there is none: nothing is spoken, nothing is heard, nothing is sent', async () => {
    const sent = fakeFetch(() => audio('x'));
    const speech = createSpeechService(loadConfig({}).deepgram);

    expect(speech).toBeInstanceOf(NullSpeechService);
    expect(speech.available).toBe(false);
    expect(await speech.speak(['Hello.'])).toBeNull();
    expect(await speech.transcribe(new Uint8Array([1]), 'audio/webm', [])).toEqual({
      ok: false,
      ms: 0,
      error: 'No Deepgram key is set.',
    });
    expect(() => {
      speech.prepare(['Hello.']);
    }).not.toThrow();
    expect(sent).toHaveLength(0);
  });
});
