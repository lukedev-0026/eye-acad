import type { RenderedItem } from '@/domain/examiner/render';

const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

export function wordsToDigits(text: string): string {
  const tens = TENS.filter(Boolean).join('|');
  const units = UNITS.slice(1, 10).join('|');
  return text
    .replace(
      new RegExp(String.raw`\b(${tens})[ -](${units})\b`, 'g'),
      (_m, t: string, u: string) =>
        String(TENS.indexOf(t) * 10 + UNITS.indexOf(u)),
    )
    .replace(new RegExp(String.raw`\b(${tens})\b`, 'g'), (t) =>
      String(TENS.indexOf(t) * 10),
    )
    .replace(new RegExp(String.raw`\b(${UNITS.join('|')})\b`, 'g'), (u) =>
      String(UNITS.indexOf(u)),
    );
}

/** "3.50" and "3.5" are the same number; "23:55" and "2355" the same time. */
export function numbersIn(text: string): Array<string> {
  return (text.replace(/(\d):(\d)/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? []).map(
    (n) => String(Number(n)),
  );
}

export function normaliseSpeech(text: string): string {
  return wordsToDigits(text.toLowerCase().replace(/[‘’']/g, '')).replace(
    /meters\b/g,
    'metres',
  );
}

const HEARD_UNIT: Record<string, RegExp> = {
  mmHg: /millimetres? of mercury/,
  mm: /millimetres?/,
  Snellen: /snellen/,
  dioptres: /diopt(re|er)/,
};

/** What was lost between sentence and transcript; empty if it all survived. */
export function problemsHeard(
  item: RenderedItem,
  unit: string | null,
  heard: string,
): Array<string> {
  const problems: Array<string> = [];
  const h = normaliseSpeech(heard);
  if (item.eyeLabel && !h.includes(item.eyeLabel.toLowerCase()))
    problems.push(`eye not heard: "${item.eyeLabel}"`);
  if (
    item.eye === 'right' &&
    /\bleft eye\b/.test(h) &&
    !/left/i.test(item.value)
  )
    problems.push('the other eye was heard');
  if (
    item.eye === 'left' &&
    /\bright eye\b/.test(h) &&
    !/right/i.test(item.value)
  )
    problems.push('the other eye was heard');
  const heardNumbers = numbersIn(h);
  const heardDigits = h.replace(/\D/g, '');
  for (const n of numbersIn(normaliseSpeech(item.speech))) {
    if (!heardNumbers.includes(n) && !heardDigits.includes(n.replace('.', '')))
      problems.push(`number not heard: ${n}`);
  }
  const unitHeard = unit ? HEARD_UNIT[unit] : undefined;
  if (unitHeard && item.available && !unitHeard.test(h))
    problems.push(`unit not heard: ${unit}`);
  if (!item.available && !h.includes('not available'))
    problems.push('"not available" not heard');
  return problems;
}
