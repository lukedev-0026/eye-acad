import { describe, expect, it } from 'vitest';

import { renderFinding } from '@/domain/examiner/render';
import type { RenderedItem } from '@/domain/examiner/render';
import {
  normaliseSpeech,
  numbersIn,
  problemsHeard,
  wordsToDigits,
} from '@/eval/voice/heard-back';
import { loadCase } from '@/infrastructure/files/case-file.loader';

const publicCase = await loadCase();
function row(id: string): { item: RenderedItem; unit: string | null } {
  const finding = publicCase.findings.find((f) => f.id === id);
  if (!finding) throw new Error(`no finding ${id}`);
  return {
    item: renderFinding(finding),
    unit: finding.available ? finding.unit : null,
  };
}
const heardFor = (id: string, heard: string) => {
  const { item, unit } = row(id);
  return problemsHeard(item, unit, heard);
};

describe('reading a transcript the way a listener would', () => {
  it('turns numbers spoken as words into digits', () => {
    expect(wordsToDigits('twenty three fifty five')).toBe('23 55');
    expect(wordsToDigits('fifty-eight millimetres')).toBe('58 millimetres');
    expect(wordsToDigits('eighteen and forty')).toBe('18 and 40');
  });

  it('treats a time with or without its colon, and a decimal with or without its trailing zero, as the same', () => {
    expect(numbersIn('at 23:55 it was 3.50')).toEqual(['2355', '3.5']);
    expect(numbersIn('at 2355 it was 3.5')).toEqual(['2355', '3.5']);
  });

  it('accepts American spelling of a unit', () => {
    expect(normaliseSpeech('58 Millimeters of mercury')).toBe(
      '58 millimetres of mercury',
    );
  });
});

describe('what went missing between the sentence and what was heard', () => {
  it('is nothing when the eye, the number, the unit and the time all came back', () => {
    const heard =
      'Right eye intraocular pressure 58 millimeters of mercury method Goldman applanation 23:55';

    expect(heardFor('iop_right', heard)).toEqual([]);
  });

  it('is nothing when the numbers came back as words', () => {
    const heard =
      'right eye intraocular pressure fifty eight millimetres of mercury method goldmann applanation twenty three fifty five';

    expect(heardFor('iop_right', heard)).toEqual([]);
  });

  it('is the eye, when the other eye was heard', () => {
    const heard =
      'Left eye intraocular pressure 58 millimetres of mercury method Goldmann applanation 23:55';

    expect(heardFor('iop_right', heard)).toEqual([
      'eye not heard: "Right eye"',
      'the other eye was heard',
    ]);
  });

  it('is the number, when a different one was heard', () => {
    const heard =
      'Right eye intraocular pressure 18 millimetres of mercury method Goldmann applanation 23:55';

    expect(heardFor('iop_right', heard)).toEqual(['number not heard: 58']);
  });

  it('is the unit, when it was dropped', () => {
    const heard =
      'Right eye intraocular pressure 58 method Goldmann applanation 23:55';

    expect(heardFor('iop_right', heard)).toEqual(['unit not heard: mmHg']);
  });

  it('is "not available", when an unavailable finding was heard as something else', () => {
    const { item } = row('gonio_right');

    expect(item.available).toBe(false);
    expect(
      problemsHeard(item, null, 'Right eye gonioscopy no view corneal edema'),
    ).toContain('"not available" not heard');
    expect(problemsHeard(item, null, item.speech)).toEqual([]);
  });

  it('is nothing for any sentence heard back exactly as it was said', () => {
    for (const finding of publicCase.findings) {
      const item = renderFinding(finding);

      expect(
        problemsHeard(
          item,
          finding.available ? finding.unit : null,
          item.speech,
        ),
        finding.id,
      ).toEqual([]);
    }
  });
});
