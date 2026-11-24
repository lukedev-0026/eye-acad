// Makes a displayed value sayable. Keyed on the row's own unit, so nothing here
// knows about any particular finding. Anything unrecognised is passed through
// unchanged for the voice to read as best it can.

const SPOKEN_UNIT: Record<string, string> = {
  mmHg: 'millimetres of mercury',
  mm: 'millimetres',
  cm: 'centimetres',
  'µm': 'micrometres',
  'μm': 'micrometres',
  um: 'micrometres',
  microns: 'microns',
  dioptres: 'dioptres',
  D: 'dioptres',
  '%': 'percent',
  kPa: 'kilopascals',
  'mmol/L': 'millimoles per litre',
  bpm: 'beats per minute',
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const NUMBER = String.raw`\d+(?:\.\d+)?`

export function speakValue(display: string, unit: string | null): string {
  let text = display

  if (unit) {
    const spoken = SPOKEN_UNIT[unit] ?? unit
    const u = escapeRegExp(unit)
    // "168/94 mmHg" -> "168 over 94 millimetres of mercury"
    text = text.replace(
      new RegExp(String.raw`(${NUMBER})\s*\/\s*(${NUMBER})\s*${u}(?![\w/])`, 'g'),
      `$1 over $2 ${spoken}`,
    )
    // "58 mmHg" -> "58 millimetres of mercury"; "5 mm" inside prose likewise.
    text = text.replace(
      new RegExp(String.raw`(${NUMBER})\s*${u}(?![\w/])`, 'g'),
      `$1 ${spoken}`,
    )
  }

  if (unit === 'dioptres' || unit === 'D') {
    // "+3.50 DS" -> "plus 3.50 dioptres sphere"
    text = text.replace(
      new RegExp(String.raw`([+\-−])\s*(${NUMBER})\s*D([SC])?\b`, 'g'),
      (_m, sign: string, n: string, kind?: string) =>
        `${sign === '+' ? 'plus' : 'minus'} ${n} dioptres` +
        (kind === 'S' ? ' sphere' : kind === 'C' ? ' cylinder' : ''),
    )
  }

  return text
}

// A short all-capitals label is an abbreviation; say it letter by letter.
export function speakLabel(label: string): string {
  return /^[A-Z]{2,5}$/.test(label) ? label.split('').join(' ') : label
}
