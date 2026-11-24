import type { Eye, Finding, PatientValue } from '@/domain/case/case.schema';

import { speakLabel, speakValue } from './spoken-value';

// Turns one row of the case file into the words shown and the words spoken.
// No model is involved: this is the only place clinical values become text.

export interface RenderedItem {
  // A finding id, or `history:<key>` for part of the patient's history.
  id: string;
  kind: 'finding' | 'history';
  eye: Eye;
  eyeLabel: string;
  label: string;
  value: string;
  method: string | null;
  available: boolean;
  display: string;
  speech: string;
}

const EYE_LABEL: Record<Exclude<Eye, null>, string> = {
  right: 'Right eye',
  left: 'Left eye',
  both: 'Both eyes',
};

// A plain number (58) or a bare ratio (168/94, 6/36). Only these get the unit
// appended. Anything else is prose that already says what it needs to
// ("Mid-dilated, 5 mm, unreactive to light"), and adding the unit would
// double it.
const BARE_NUMBER_OR_RATIO = /^\s*[+\-−]?\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?\s*$/;

function isBareNumberOrRatio(value: string | number): boolean {
  return typeof value === 'number' || BARE_NUMBER_OR_RATIO.test(value);
}

export function formatValue(row: Finding): string {
  // Decided by the `available` flag alone. One supplied row is unavailable
  // yet still carries text in `value`; that text must never be read out.
  if (!row.available) {
    return row.unavailable_reason ? `Not available: ${row.unavailable_reason}` : 'Not available';
  }
  if (row.value === null || row.value === '') return 'No result recorded';
  const text = String(row.value).trim();
  return row.unit && isBareNumberOrRatio(row.value) ? `${text} ${row.unit}` : text;
}

export function renderFinding(row: Finding): RenderedItem {
  const eyeLabel = row.eye ? EYE_LABEL[row.eye] : '';
  const value = formatValue(row);
  const method = row.available ? row.method : null;
  const display = (eyeLabel ? `${eyeLabel} · ` : '') + `${row.label}: ${value}` + (method ? ` (${method})` : '');
  const speech =
    (eyeLabel ? `${eyeLabel}. ` : '') +
    `${speakLabel(row.label)}: ${speakValue(value, row.unit)}.` +
    (method ? ` Method: ${method}.` : '');
  return {
    id: row.id,
    kind: 'finding',
    eye: row.eye,
    eyeLabel,
    label: row.label,
    value,
    method,
    available: row.available,
    display,
    speech,
  };
}

// "past_ocular_history" -> "Past ocular history"
export function historyLabel(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function renderHistory(key: string, raw: PatientValue | null): RenderedItem {
  const label = historyLabel(key);
  const value = raw === null || raw === '' ? 'Not recorded' : Array.isArray(raw) ? raw.join('; ') : String(raw);
  return {
    id: `history:${key}`,
    kind: 'history',
    eye: null,
    eyeLabel: '',
    label,
    value,
    method: null,
    available: true,
    display: `${label}: ${value}`,
    speech: `${label}: ${value}${/[.!?]$/.test(value) ? '' : '.'}`,
  };
}

// Speech sent for one reply is capped, so a broad request cannot run up a long
// (and paid) synthesis. Whole items only: a value is never cut in half.
export const MAX_SPEECH_CHARS = 600;

export function composeSpeechParts(parts: Array<string>, closing: string): Array<string> {
  const out: Array<string> = [];
  let length = 0;
  for (const [i, part] of parts.entries()) {
    const next = length + (length ? 1 : 0) + part.length;
    if (next > MAX_SPEECH_CHARS && i > 0) return [...out, closing];
    out.push(part);
    length = next;
  }
  return out;
}

export const composeSpeech = (parts: Array<string>, closing: string): string =>
  composeSpeechParts(parts, closing).join(' ');
