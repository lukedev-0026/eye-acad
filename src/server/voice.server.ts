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
