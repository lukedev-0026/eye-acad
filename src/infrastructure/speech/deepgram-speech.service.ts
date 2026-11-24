import { describeError } from '@/common/errors/to-error';
import type { AppConfig } from '@/config/env.server';
import type { Secret } from '@/config/secret';
import type { SpeechService, SpokenReply, Transcription } from '@/domain/speech/speech.service';

import { DeepgramListenReplySchema } from './deepgram.schema';
import { NullSpeechService } from './null-speech.service';

// Speech in and speech out, both through Deepgram's plain HTTP API.

const API = 'https://api.deepgram.com/v1';
export const STT_LANGUAGE = 'en-GB';
export const MAX_AUDIO_BYTES = 2_500_000;
const REQUEST_TIMEOUT_MS = 30_000;
// The most keyterms sent with one recording.
const MAX_KEYTERMS = 60;
// Clips kept in memory. The oldest goes first.
const MAX_HELD = 600;
const PREPARE_WORKERS = 3;

export interface Speech {
  readonly audioBase64: string;
  readonly mimeType: 'audio/mpeg';
  readonly ms: number;
  readonly voice: string;
}

export interface DeepgramOptions {
  readonly apiKey: Secret;
  // Tried in order: a UK-English medical model, then the general one if the
  // first refuses a request.
  readonly sttModels: ReadonlyArray<string>;
  // A British English voice.
  readonly ttsVoice: string;
  // "single" is the first version (one request for a whole reply, nothing
  // kept), so the two can be timed side by side.
  readonly speechMode: 'per-sentence' | 'single';
}

export class DeepgramSpeechService implements SpeechService {
  readonly available = true;
  readonly voice: string;
  private readonly apiKey: Secret;
  private readonly sttModels: ReadonlyArray<string>;
  private readonly speechMode: DeepgramOptions['speechMode'];

  // Audio already made, by exact text. The examiner's sentences about a case
  // are a small fixed set, so most replies are served from here. The key is
  // the text itself: edit a value in the case file and the old clip is simply
  // never asked for again.
  private readonly held = new Map<string, Speech>();
  private lastSynthesisError: string | null = null;

  constructor(options: DeepgramOptions) {
    this.apiKey = options.apiKey;
    this.sttModels = options.sttModels;
    this.voice = options.ttsVoice;
    this.speechMode = options.speechMode;
  }

  // Why the most recent speech request failed, for the command-line checks.
  get lastError(): string | null {
    return this.lastSynthesisError;
  }

  get heldCount(): number {
    return this.held.size;
  }

  async transcribe(audio: Uint8Array, mimeType: string, keyterms: ReadonlyArray<string>): Promise<Transcription> {
    const started = performance.now();
    const elapsed = (): number => Math.round(performance.now() - started);
    if (audio.byteLength > MAX_AUDIO_BYTES) return { ok: false, ms: 0, error: 'Recording too long.' };

    let lastError = 'unknown';
    for (const model of this.sttModels) {
      const params = new URLSearchParams({ model, language: STT_LANGUAGE, smart_format: 'true' });
      for (const term of keyterms.slice(0, MAX_KEYTERMS)) params.append('keyterm', term);
      try {
        const res = await fetch(`${API}/listen?${params.toString()}`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${this.apiKey.reveal()}`,
            'Content-Type': mimeType.split(';')[0] || 'audio/webm',
          },
          body: new Uint8Array(audio),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const reply = DeepgramListenReplySchema.parse(await res.json());
        if (!res.ok) {
          lastError = `${model}: HTTP ${res.status} ${reply.err_msg ?? ''}`.trim();
          continue;
        }
        const text = reply.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
        return { ok: true, text: text.trim(), ms: elapsed(), model };
      } catch (error) {
        lastError = `${model}: ${describeError(error)}`;
      }
    }
    return { ok: false, ms: elapsed(), error: lastError };
  }

  // One clip for one piece of text, or null if it could not be made.
  async synthesise(text: string): Promise<Speech | null> {
    if (!text.trim()) return null;
    const started = performance.now();
    try {
      const query = new URLSearchParams({ model: this.voice, encoding: 'mp3' }).toString();
      const res = await fetch(`${API}/speak?${query}`, {
        method: 'POST',
        headers: { Authorization: `Token ${this.apiKey.reveal()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.lastSynthesisError = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
        return null;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      return {
        audioBase64: bytes.toString('base64'),
        mimeType: 'audio/mpeg',
        ms: Math.round(performance.now() - started),
        voice: this.voice,
      };
    } catch (error) {
      this.lastSynthesisError = describeError(error);
      return null;
    }
  }

  // The parts are synthesised at the same time, so the wait is the slowest
  // one, not the sum.
  async speak(parts: ReadonlyArray<string>): Promise<SpokenReply | null> {
    const wanted = parts.map((p) => p.trim()).filter(Boolean);
    if (!wanted.length) return null;
    const started = performance.now();
    if (this.speechMode === 'single') {
      const whole = await this.synthesise(wanted.join(' '));
      return whole
        ? {
            clips: [{ audioBase64: whole.audioBase64, mimeType: whole.mimeType }],
            ms: whole.ms,
            fromCache: 0,
            voice: whole.voice,
          }
        : null;
    }
    const clips = await Promise.all(wanted.map((text) => this.clipFor(text)));
    const made = clips.filter((clip) => clip !== null);
    if (made.length !== clips.length) return null;
    return {
      clips: made.map((clip) => ({ audioBase64: clip.speech.audioBase64, mimeType: clip.speech.mimeType })),
      ms: Math.round(performance.now() - started),
      fromCache: made.filter((clip) => clip.cached).length,
      voice: this.voice,
    };
  }

  // Called when an attempt starts, with every sentence the examiner could say
  // about the case. A few at a time.
  prepare(parts: ReadonlyArray<string>): void {
    if (this.speechMode === 'single') return;
    const queue = parts.map((p) => p.trim()).filter((p) => p && !this.held.has(p));
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        await this.clipFor(next).catch(() => null);
      }
    };
    void Promise.all(Array.from({ length: PREPARE_WORKERS }, worker));
  }

  private async clipFor(text: string): Promise<{ speech: Speech; cached: boolean } | null> {
    const have = this.held.get(text);
    if (have) return { speech: have, cached: true };
    const made = await this.synthesise(text);
    if (!made) return null;
    if (this.held.size >= MAX_HELD) {
      const oldest = this.held.keys().next();
      if (!oldest.done) this.held.delete(oldest.value);
    }
    this.held.set(text, made);
    return { speech: made, cached: false };
  }
}

// Deepgram when there is a key; otherwise the silent stand-in.
export function createSpeechService(config: AppConfig['deepgram']): SpeechService {
  return config.apiKey
    ? new DeepgramSpeechService({
        apiKey: config.apiKey,
        sttModels: config.sttModels,
        ttsVoice: config.ttsVoice,
        speechMode: config.speechMode,
      })
    : new NullSpeechService();
}
