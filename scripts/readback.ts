// The spoken read-back check. For every finding and history item: turn the
// spoken sentence into audio, turn that audio back into text, and check that
// the eye, every number and the unit survived. Text tests cannot show what
// the voice actually says; this does.
//   pnpm readback            every row
//   pnpm readback iop_right  one row, printing the transcript
import { writeFile } from 'node:fs/promises'
import { buildCatalogue } from '../src/server/catalogue'
import { loadCase } from '../src/server/case.server'
import { renderFinding, renderHistory } from '../src/server/render'
import type { RenderedItem } from '../src/server/render'
import { STT_LANGUAGE, TTS_VOICE, lastSpeechError, synthesise, transcribe, voiceAvailable } from '../src/server/voice.server'
import { appendRow } from '../src/eval/run'

if (!voiceAvailable()) {
  console.error('No DEEPGRAM_API_KEY in .env.local, so nothing can be spoken or heard.')
  process.exit(1)
}

// A sentence id to try on its own, and/or --runs N (default 3). The voice and
// the transcription both vary from run to run, so one pass proves little.
const argv = process.argv.slice(2)
const runsAt = argv.indexOf('--runs')
const RUNS = runsAt >= 0 ? Number(argv[runsAt + 1]) : 3
const only = argv.find((a, i) => !a.startsWith('--') && i !== runsAt + 1)
const c = await loadCase()
const keyterms = buildCatalogue(c).names
const items: Array<{ item: RenderedItem; unit: string | null }> = [
  ...c.findings.map((f) => ({ item: renderFinding(f), unit: f.available ? f.unit : null })),
  ...Object.entries(c.patient).map(([k, v]) => ({ item: renderHistory(k, v), unit: null })),
].filter((x) => !only || x.item.id === only)

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
// "twenty three fifty five" -> "23 55": a time or a number may be transcribed
// as words, which is still the right thing having been said.
function wordsToDigits(text: string): string {
  const tens = TENS.filter(Boolean).join('|')
  const units = UNITS.slice(1, 10).join('|')
  return text
    .replace(new RegExp(String.raw`\b(${tens})[ -](${units})\b`, 'g'), (_m, t: string, u: string) => String(TENS.indexOf(t) * 10 + UNITS.indexOf(u)))
    .replace(new RegExp(String.raw`\b(${tens})\b`, 'g'), (t) => String(TENS.indexOf(t) * 10))
    .replace(new RegExp(String.raw`\b(${UNITS.join('|')})\b`, 'g'), (u) => String(UNITS.indexOf(u)))
}
// "3.50" and "3.5" are the same number; "23:55" and "2355" the same time.
const numbersIn = (text: string) =>
  (text.replace(/(\d):(\d)/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))
const normalise = (text: string) =>
  wordsToDigits(text.toLowerCase().replace(/[‘’']/g, ''))
    .replace(/meters\b/g, 'metres')

// How each unit is said aloud, as it should be heard back.
const HEARD_UNIT: Record<string, RegExp> = {
  mmHg: /millimetres? of mercury/,
  mm: /millimetres?/,
  Snellen: /snellen/,
  // Heard back as "diopters", or run together as "dioptersphere".
  dioptres: /diopt(re|er)/,
}

const runId = `readback-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
const rows: Array<{ id: string; run: number; pass: boolean; problems: Array<string>; said: string; heard: string }> = []

for (let run = 1; run <= RUNS; run++)
for (const { item, unit } of items) {
  const problems: Array<string> = []
  const speech = await synthesise(item.speech)
  let heard = ''
  if (!speech) problems.push(`speech could not be produced (${lastSpeechError})`)
  else {
    const stt = await transcribe(Buffer.from(speech.audioBase64, 'base64'), speech.mimeType, keyterms)
    if (!stt.ok) problems.push(`audio could not be transcribed (${stt.error})`)
    else heard = stt.text
  }
  if (heard) {
    const h = normalise(heard)
    // The eye, exactly as named.
    if (item.eyeLabel && !h.includes(item.eyeLabel.toLowerCase())) problems.push(`eye not heard: "${item.eyeLabel}"`)
    if (item.eye === 'right' && /\bleft eye\b/.test(h) && !/left/i.test(item.value)) problems.push('the other eye was heard')
    if (item.eye === 'left' && /\bright eye\b/.test(h) && !/right/i.test(item.value)) problems.push('the other eye was heard')
    // Every number that was said.
    const heardNumbers = numbersIn(h)
    const heardDigits = h.replace(/\D/g, '')
    for (const n of numbersIn(normalise(item.speech))) {
      if (!heardNumbers.includes(n) && !heardDigits.includes(n.replace('.', ''))) problems.push(`number not heard: ${n}`)
    }
    // The unit, where the row has one that is spoken in a known way.
    if (unit && HEARD_UNIT[unit] && item.available && !HEARD_UNIT[unit].test(h)) problems.push(`unit not heard: ${unit}`)
    if (!item.available && !h.includes('not available')) problems.push('"not available" not heard')
  }
  const row = { id: item.id, run, pass: problems.length === 0, problems, said: item.speech, heard }
  rows.push(row)
  await appendRow(runId, { type: 'readback', runId, at: new Date().toISOString(), voice: TTS_VOICE(), language: STT_LANGUAGE, ...row })
  if (only) console.log(`said : ${item.speech}\nheard: ${heard}\n${problems.length ? `PROBLEMS: ${problems.join('; ')}` : 'ok'}`)
  else process.stdout.write(row.pass ? '.' : 'x')
}

if (!only) {
  const ids = [...new Set(rows.map((r) => r.id))]
  const everyRun = ids.filter((id) => rows.filter((r) => r.id === id).every((r) => r.pass))
  const failing = rows.filter((r) => !r.pass)
  const eyeLost = failing.filter((r) => r.problems.some((p) => p.includes('eye')))
  const noAudio = failing.filter((r) => r.problems.some((p) => p.startsWith('speech could not')))
  const md = [
    '# Spoken read-back check',
    '',
    `Generated by \`pnpm readback\` on ${new Date().toISOString().slice(0, 10)} from \`evals/results/${runId}.jsonl\`.`,
    `Each sentence the examiner can say about the case was turned into audio (voice \`${TTS_VOICE()}\`), and the audio was turned back into text (${STT_LANGUAGE}), ${RUNS} times. The check is that the eye, every number and the unit are in what was heard.`,
    '',
    `**${everyRun.length} of ${ids.length} sentences passed on every one of ${RUNS} runs** (${rows.filter((r) => r.pass).length} of ${rows.length} individual runs).`,
    `Runs where the eye was not heard correctly: ${eyeLost.length}. Runs where no audio was produced: ${noAudio.length}.`,
    '',
    ...(failing.length
      ? ['| Row | Run | What went missing | Said | Heard back |', '|---|---|---|---|---|', ...failing.map((r) => `| ${r.id} | ${r.run} | ${r.problems.join('; ')} | ${r.said} | ${r.heard} |`), '']
      : []),
    'A failure here can be the voice saying it wrongly or the transcription hearing it wrongly. The table shows both sides so a person can listen and tell which.',
    '',
  ].join('\n')
  await writeFile('evals/readback.md', md)
  console.log(`\n${everyRun.length} of ${ids.length} sentences passed on every one of ${RUNS} runs (${rows.filter((r) => r.pass).length} of ${rows.length} runs). Eye not heard: ${eyeLost.length} runs. No audio: ${noAudio.length} runs. Wrote evals/readback.md`)
  for (const r of failing) console.log(`  ${r.id} (run ${r.run}): ${r.problems.join('; ')}\n    heard: ${r.heard}`)
}
