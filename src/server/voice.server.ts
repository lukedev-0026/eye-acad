import { loadEnv } from './env.server'

// Speech in and speech out, both through Deepgram's plain HTTP API. The words
// to be spoken are always built by code before they reach this file, so the
// voice can only ever say what is also shown.

const API = 'https://api.deepgram.com/v1'

// A UK-English medical speech-to-text model, with the general model as a
// fallback if the medical one rejects a request.
export const STT_MODELS = [
  process.env.VIVA_STT_MODEL ?? 'nova-3-medical',
  'nova-3',
] as const
export const STT_LANGUAGE = 'en-GB'
// A British English voice.
export const TTS_VOICE = () => process.env.VIVA_TTS_VOICE ?? 'aura-2-draco-en'

export const MAX_AUDIO_BYTES = 2_500_000

function key(): string | null {
  loadEnv()
  return process.env.DEEPGRAM_API_KEY?.trim() || null
}

export const voiceAvailable = () => key() !== null

export type Transcription =
  | { ok: true; text: string; ms: number; model: string }
  | { ok: false; ms: number; error: string }

type ListenResponse = {
  results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> }
  err_msg?: string
}

// `keyterms` are the names of the findings in the current case. They nudge
// recognition towards clinical words; they are names only, never results.
export async function transcribe(
  audio: Buffer,
  mimeType: string,
  keyterms: Array<string>,
): Promise<Transcription> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  const apiKey = key()
  if (!apiKey) return { ok: false, ms: 0, error: 'No Deepgram key is set.' }
  if (audio.byteLength > MAX_AUDIO_BYTES) return { ok: false, ms: 0, error: 'Recording too long.' }

  let lastError = 'unknown'
  for (const model of STT_MODELS) {
    const params = new URLSearchParams({ model, language: STT_LANGUAGE, smart_format: 'true' })
    for (const term of keyterms.slice(0, 60)) params.append('keyterm', term)
    try {
      const res = await fetch(`${API}/listen?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': mimeType.split(';')[0] || 'audio/webm' },
        body: new Uint8Array(audio),
        signal: AbortSignal.timeout(30_000),
      })
      const json = (await res.json()) as ListenResponse
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status} ${json.err_msg ?? ''}`.trim()
        continue
      }
      const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
      return { ok: true, text: text.trim(), ms: elapsed(), model }
    } catch (e) {
      lastError = `${model}: ${String(e)}`
    }
  }
  return { ok: false, ms: elapsed(), error: lastError }
}

export type Speech = { audioBase64: string; mimeType: 'audio/mpeg'; ms: number; voice: string }

// Returns null when speech is unavailable. The caller still shows the text,
// so a missing key or a failed request never blocks the session.
export async function synthesise(text: string): Promise<Speech | null> {
  const apiKey = key()
  if (!apiKey || !text.trim()) return null
  const started = performance.now()
  const voice = TTS_VOICE()
  try {
    const res = await fetch(`${API}/speak?${new URLSearchParams({ model: voice, encoding: 'mp3' }).toString()}`, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      lastSpeechError = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
      return null
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    return {
      audioBase64: bytes.toString('base64'),
      mimeType: 'audio/mpeg',
      ms: Math.round(performance.now() - started),
      voice,
    }
  } catch (e) {
    lastSpeechError = String(e)
    return null
  }
}

// Why the most recent speech request failed, for the command-line checks.
export let lastSpeechError: string | null = null

export type SpokenReply = {
  // One clip per sentence group, in order. They travel together in one reply
  // and are played back to back.
  clips: Array<{ audioBase64: string; mimeType: 'audio/mpeg' }>
  // Time this reply spent waiting for synthesis. Zero when every clip was
  // already held.
  ms: number
  fromCache: number
  voice: string
}

// Audio already made, by voice and exact text. The examiner's sentences about
// a case are a small fixed set, so most replies are served from here. The key
// is the text itself: edit a value in the case file and the old clip is
// simply never asked for again.
const held = new Map<string, Speech>()
const MAX_HELD = 600

async function clipFor(text: string): Promise<{ speech: Speech; cached: boolean } | null> {
  const key = `${TTS_VOICE()}|${text}`
  const have = held.get(key)
  if (have) return { speech: have, cached: true }
  const made = await synthesise(text)
  if (!made) return null
  if (held.size >= MAX_HELD) held.delete(held.keys().next().value as string)
  held.set(key, made)
  return { speech: made, cached: false }
}

// Speaks a reply made of several sentence groups. They are synthesised at the
// same time, so the wait is the slowest one, not the sum. If any part fails,
// nothing is spoken at all: saying only some of what is on screen would be
// worse than saying none of it.
export async function speakParts(parts: Array<string>): Promise<SpokenReply | null> {
  const wanted = parts.map((p) => p.trim()).filter(Boolean)
  if (!wanted.length || !voiceAvailable()) return null
  const started = performance.now()
  // VIVA_SPEECH_MODE=single restores the first version (one request for the
  // whole reply, nothing kept), so the two can be timed side by side.
  if (process.env.VIVA_SPEECH_MODE === 'single') {
    const whole = await synthesise(wanted.join(' '))
    return whole
      ? { clips: [{ audioBase64: whole.audioBase64, mimeType: whole.mimeType }], ms: whole.ms, fromCache: 0, voice: whole.voice }
      : null
  }
  const clips = await Promise.all(wanted.map(clipFor))
  if (clips.some((c) => c === null)) return null
  const ok = clips as Array<{ speech: Speech; cached: boolean }>
  return {
    clips: ok.map((c) => ({ audioBase64: c.speech.audioBase64, mimeType: c.speech.mimeType })),
    ms: Math.round(performance.now() - started),
    fromCache: ok.filter((c) => c.cached).length,
    voice: TTS_VOICE(),
  }
}

// Makes the audio for a set of sentences ahead of time, a few at a time, and
// never throws. Called when an attempt starts, with every sentence the
// examiner could say about the case.
export function prepareSpeech(parts: Array<string>): void {
  if (!voiceAvailable() || process.env.VIVA_SPEECH_MODE === 'single') return
  const queue = parts.map((p) => p.trim()).filter((p) => p && !held.has(`${TTS_VOICE()}|${p}`))
  const worker = async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      await clipFor(next).catch(() => null)
    }
  }
  void Promise.all([worker(), worker(), worker()])
}

export const heldSpeechCount = () => held.size
