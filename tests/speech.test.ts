import { describe, expect, it } from 'vitest';
import { speakLabel, speakValue } from '../src/server/speech';

describe('speakValue', () => {
  it('says the unit of a pressure in full', () => {
    expect(speakValue('58 mmHg', 'mmHg')).toBe('58 millimetres of mercury');
  });
  it('says a blood pressure as "over"', () => {
    expect(speakValue('168/94 mmHg', 'mmHg')).toBe('168 over 94 millimetres of mercury');
  });
  it('says a Snellen fraction as "over"', () => {
    expect(speakValue('6/36 Snellen', 'Snellen')).toBe('6 over 36 Snellen');
  });
  it('expands the row unit inside prose, once', () => {
    expect(speakValue('Mid-dilated, 5 mm, unreactive to light', 'mm')).toBe(
      'Mid-dilated, 5 millimetres, unreactive to light',
    );
  });
  it('does not touch a longer unit that starts the same way', () => {
    expect(speakValue('58 mmHg', 'mm')).toBe('58 mmHg');
  });
  it('reads a spectacle prescription', () => {
    expect(speakValue('Right +3.50 DS, left -1.25 DC', 'dioptres')).toBe(
      'Right plus 3.50 dioptres sphere, left minus 1.25 dioptres cylinder',
    );
  });
  it('passes an unknown unit through unchanged', () => {
    expect(speakValue('12 zorbs', 'zorbs')).toBe('12 zorbs');
  });
  it('leaves fractions in prose alone', () => {
    const text = 'under 1/4 of corneal thickness';
    expect(speakValue(text, null)).toBe(text);
  });
});

describe('speakLabel', () => {
  it('spells out a short abbreviation', () => {
    expect(speakLabel('OCT')).toBe('O C T');
  });
  it('leaves ordinary labels alone', () => {
    expect(speakLabel('Visual acuity')).toBe('Visual acuity');
  });
});
