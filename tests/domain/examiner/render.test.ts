import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CaseFileSchema } from '@/domain/case/case.schema';
import type { Finding } from '@/domain/case/case.schema';
import {
  MAX_SPEECH_CHARS,
  composeSpeech,
  composeSpeechParts,
  formatValue,
  renderFinding,
  renderHistory,
} from '@/domain/examiner/render';

// Expectations are computed from the raw case file, not typed in here, so the
// tests still mean something after a reviewer edits a value.
const raw = JSON.parse(readFileSync('data/case-EA-VIVA-001.json', 'utf8')) as {
  findings: Array<Record<string, unknown>>;
};
const findings = CaseFileSchema.parse(raw).findings;

const numbersIn = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];

const row = (over: Partial<Finding>): Finding => ({
  id: 'x',
  eye: 'right',
  label: 'Test',
  value: 1,
  unit: null,
  method: null,
  available: true,
  ...over,
});

describe('every row of the supplied case', () => {
  for (const f of findings) {
    const r = renderFinding(f);

    it(`${f.id}: never shows a placeholder or a doubled unit`, () => {
      for (const text of [r.display, r.speech]) {
        expect(text).not.toMatch(/\b(null|undefined|NaN)\b/);
        if (f.unit) expect(text).not.toContain(`${f.unit} ${f.unit}`);
      }
    });

    it(`${f.id}: names the right eye, or none`, () => {
      const expected =
        f.eye === 'right' ? 'Right eye' : f.eye === 'left' ? 'Left eye' : f.eye === 'both' ? 'Both eyes' : '';
      expect(r.eyeLabel).toBe(expected);
      if (expected) {
        expect(r.display.startsWith(`${expected} · `)).toBe(true);
        expect(r.speech.startsWith(`${expected}. `)).toBe(true);
      } else {
        expect(r.display).not.toMatch(/\b(Right|Left|Both) eyes?\b/);
      }
    });

    if (f.available) {
      it(`${f.id}: shows its value, with the unit on a bare number`, () => {
        expect(f.value).not.toBeNull();
        expect(r.value).toContain(String(f.value));
        if (typeof f.value === 'number') {
          expect(r.value).toBe(`${f.value} ${f.unit}`);
        }
      });

      it(`${f.id}: every number shown is also spoken`, () => {
        for (const n of numbersIn(r.value)) expect(r.speech).toContain(n);
      });
    } else {
      it(`${f.id}: gives its reason and nothing from the value field`, () => {
        expect(r.value).toBe(`Not available: ${f.unavailable_reason}`);
        if (f.value !== null) {
          expect(r.display).not.toContain(String(f.value));
          expect(r.speech).not.toContain(String(f.value));
        }
      });
    }
  }
});

describe('unit rule', () => {
  it('appends the unit to a number and to a bare ratio', () => {
    expect(formatValue(row({ value: 58, unit: 'mmHg' }))).toBe('58 mmHg');
    expect(formatValue(row({ value: '168/94', unit: 'mmHg' }))).toBe('168/94 mmHg');
    expect(formatValue(row({ value: '6/36', unit: 'Snellen' }))).toBe('6/36 Snellen');
  });
  it('keeps a unit it has never seen', () => {
    expect(formatValue(row({ value: 540, unit: 'µm' }))).toBe('540 µm');
    expect(formatValue(row({ value: 12, unit: 'zorbs' }))).toBe('12 zorbs');
  });
  it('does not double a unit already written in the value', () => {
    expect(formatValue(row({ value: '3 mm, briskly reactive', unit: 'mm' }))).toBe('3 mm, briskly reactive');
  });
  it('decides "unavailable" from the flag, even when a value is present', () => {
    const r = renderFinding(row({ available: false, value: 'left-over text', unavailable_reason: 'Not done' }));
    expect(r.value).toBe('Not available: Not done');
    expect(r.display).not.toContain('left-over text');
  });
  it('never prints null for an available row with no value', () => {
    expect(formatValue(row({ value: null }))).toBe('No result recorded');
  });
});

describe('history', () => {
  it('returns the case file wording exactly', () => {
    const r = renderHistory('allergies', 'Sulfonamide antibiotics (rash)');
    expect(r.display).toBe('Allergies: Sulfonamide antibiotics (rash)');
  });
  it('joins a list without rewording it', () => {
    const r = renderHistory('medications', ['A 5 mg', 'B 4 mg']);
    expect(r.value).toBe('A 5 mg; B 4 mg');
  });
});

describe('speech cap', () => {
  it('never cuts an item in half', () => {
    const parts = Array.from({ length: 12 }, (_, i) => `Item ${i}: ${'x'.repeat(90)}.`);
    const out = composeSpeech(parts, 'The rest is on screen.');
    expect(out.endsWith('The rest is on screen.')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS + 30);
    const body = out.replace(' The rest is on screen.', '');
    expect(body.endsWith('.')).toBe(true);
  });
  it('leaves a short reply alone', () => {
    expect(composeSpeech(['One.', 'Two.'], 'x')).toBe('One. Two.');
  });
  it('keeps the sentences separate, so each can be spoken on its own, and says the same words', () => {
    const parts = Array.from({ length: 12 }, (_, i) => `Item ${i}: ${'x'.repeat(90)}.`);
    const kept = composeSpeechParts(parts, 'The rest is on screen.');
    expect(kept.at(-1)).toBe('The rest is on screen.');
    expect(kept.slice(0, -1)).toEqual(parts.slice(0, kept.length - 1));
    expect(kept.join(' ')).toBe(composeSpeech(parts, 'The rest is on screen.'));
  });
});
