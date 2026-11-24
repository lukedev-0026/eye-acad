// Makes short recorded questions for trying the spoken path without a
// microphone, in a different voice from the examiner's. They are synthetic
// speech, and anything measured with them is labelled as such.
//   pnpm tsx scripts/make-voice-clips.ts
import { mkdir, writeFile } from 'node:fs/promises'
import { synthesise, voiceAvailable } from '../src/server/voice.server'

const QUESTIONS = [
  'What is the intraocular pressure in the right eye?',
  'Can I have gonioscopy of the right eye?',
  'What is the visual acuity in both eyes?',
  'What does the cornea look like in the right eye?',
  'What are the pupils doing?',
  'Is there a relative afferent pupillary defect?',
  'Does she have any allergies?',
  'What medications is she taking?',
  'What is the anterior chamber depth?',
  'What is the blood pressure?',
  'What is the central corneal thickness?',
  'What does the left optic disc look like?',
]

if (!voiceAvailable()) {
  console.error('No DEEPGRAM_API_KEY in .env.local.')
  process.exit(1)
}
// A different voice from the examiner's, so the two are not confused.
process.env.VIVA_TTS_VOICE = 'aura-2-pandora-en'
await mkdir('evals/voice-clips', { recursive: true })
const index: Array<{ file: string; says: string }> = []
for (const [i, says] of QUESTIONS.entries()) {
  const speech = await synthesise(says)
  if (!speech) throw new Error(`Could not synthesise: ${says}`)
  const file = `q${String(i + 1).padStart(2, '0')}.mp3`
  await writeFile(`evals/voice-clips/${file}`, Buffer.from(speech.audioBase64, 'base64'))
  index.push({ file, says })
  console.log(file, says)
}
await writeFile('evals/voice-clips/index.json', `${JSON.stringify({ voice: 'aura-2-pandora-en', note: 'Synthetic speech, generated for testing the spoken path without a microphone.', clips: index }, null, 2)}\n`)
