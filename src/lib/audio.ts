export type ReplyAudio = { base64: string; mimeType: string }

// Plays audio that arrived inside a server reply. Resolves `started` with the
// time playback became ready, and `ended` when it finishes or fails. A failure
// to play is never an error for the caller: the words are on screen anyway.
export function playReply(audio: ReplyAudio): {
  started: Promise<number | null>
  ended: Promise<void>
  stop: () => void
} {
  const bytes = Uint8Array.from(atob(audio.base64), (ch) => ch.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: audio.mimeType }))
  const element = new Audio(url)
  let finish: () => void = () => {}
  const ended = new Promise<void>((resolve) => {
    finish = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
  })
  const started = new Promise<number | null>((resolve) => {
    // `playing` fires when the browser has audio ready and has begun to output
    // it. It marks "playback ready", not the instant sound reaches the ear.
    element.addEventListener('playing', () => resolve(performance.now()), { once: true })
    element.addEventListener('error', () => {
      resolve(null)
      finish()
    })
    element.play().catch(() => {
      resolve(null)
      finish()
    })
  })
  element.addEventListener('ended', () => finish(), { once: true })
  return {
    started,
    ended,
    stop: () => {
      element.pause()
      finish()
    },
  }
}
