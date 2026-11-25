const SPOKEN_UNIT: Record<string, string> = {
  mmHg: 'millimetres of mercury',
  mm: 'millimetres',
  cm: 'centimetres',
  µm: 'micrometres',
  μm: 'micrometres',
  um: 'micrometres',
  microns: 'microns',
  dioptres: 'dioptres',
  D: 'dioptres',
  '%': 'percent',
  kPa: 'kilopascals',
  'mmol/L': 'millimoles per litre',
  bpm: 'beats per minute',
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;

export function speakValue(display: string, unit: string | null): string {
  let text = display;

  if (unit) {
    const spoken = SPOKEN_UNIT[unit] ?? unit;
    const u = escapeRegExp(unit);
    text = text.replace(
      new RegExp(
        String.raw`(${NUMBER})\s*\/\s*(${NUMBER})\s*${u}(?![\w/])`,
        'g',
      ),
      `$1 over $2 ${spoken}`,
    );
    text = text.replace(
      new RegExp(String.raw`(${NUMBER})\s*${u}(?![\w/])`, 'g'),
      `$1 ${spoken}`,
    );
  }

  if (unit === 'dioptres' || unit === 'D') {
    text = text.replace(
      new RegExp(String.raw`([+\-−])\s*(${NUMBER})\s*D([SC])?\b`, 'g'),
      (_m, sign: string, n: string, kind?: string) =>
        `${sign === '+' ? 'plus' : 'minus'} ${n} dioptres` +
        (kind === 'S' ? ' sphere' : kind === 'C' ? ' cylinder' : ''),
    );
  }

  return text;
}

/** A short all-capitals label is an abbreviation, said letter by letter. */
export function speakLabel(label: string): string {
  return /^[A-Z]{2,5}$/.test(label) ? label.split('').join(' ') : label;
}
