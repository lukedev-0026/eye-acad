import { describe, expect, it } from 'vitest';

import { paired } from '@/eval/report/sweep.report';
import { configId } from '@/eval/run/config-id';
import type { ResultRow } from '@/eval/run/result-row';
import { summarise } from '@/eval/run/summarise';
import { settingsFor } from '@/eval/sweep/grid';

const row = (over: Partial<ResultRow>): ResultRow => ({
  type: 'result',
  runId: 'r',
  stage: 'screen',
  at: '2026-11-24T00:00:00.000Z',
  step: 'selector',
  configId: 'c',
  settings: settingsFor('selector', {
    size: 'medium',
    thinking: false,
    forceFormat: true,
  }),
  split: 'tune',
  caseId: 'a',
  caseType: 't',
  trial: 1,
  seed: 1,
  outcome: 'ok',
  pass: true,
  costly: false,
  fallback: false,
  detail: '',
  ms: 1000,
  modelMs: 900,
  calls: 1,
  promptTokens: 100,
  outputTokens: 20,
  thinkingChars: 0,
  model: 'm',
  observed: null,
  raw: '',
  ...over,
});

describe('counting results', () => {
  it('counts cases, not runs: a case passes only if every run of it passed', () => {
    const s = summarise([
      row({ caseId: 'a', trial: 1 }),
      row({ caseId: 'a', trial: 2 }),
      row({ caseId: 'a', trial: 3 }),
      row({ caseId: 'b', trial: 1 }),
      row({ caseId: 'b', trial: 2, pass: false }),
      row({ caseId: 'b', trial: 3 }),
      row({ caseId: 'c', trial: 1, pass: false }),
      row({ caseId: 'c', trial: 2, pass: false }),
      row({ caseId: 'c', trial: 3, pass: false }),
    ]);
    expect(s.cases).toBe(3);
    expect(s.trialsPerCase).toBe(3);
    expect(s.casesAllPass).toBe(1);
    expect(s.casesFlipped).toBe(1);
    expect(s.trialsPassed).toBe(5);
  });
  it('leaves calls that never reached the model out of the count, and lists them', () => {
    const s = summarise([
      row({ caseId: 'a' }),
      row({ caseId: 'b', outcome: 'infra_error', pass: false }),
    ]);
    expect(s.cases).toBe(1);
    expect(s.infraErrors).toBe(1);
  });
  it('counts a cut-off or unusable reply as a failed run', () => {
    const s = summarise([
      row({ caseId: 'a', outcome: 'truncated', pass: false }),
      row({ caseId: 'b', outcome: 'schema_invalid', pass: false }),
    ]);
    expect(s.cases).toBe(2);
    expect(s.casesAllPass).toBe(0);
    expect(s.truncated).toBe(1);
    expect(s.schemaInvalid).toBe(1);
  });
  it('gives the median and range of call times', () => {
    const s = summarise([
      row({ caseId: 'a', ms: 300 }),
      row({ caseId: 'b', ms: 900 }),
      row({ caseId: 'c', ms: 500 }),
    ]);
    expect([s.medianMs, s.minMs, s.maxMs]).toEqual([500, 300, 900]);
  });
});

describe('configuration ids', () => {
  it('are the same for the same settings and differ when any swept setting changes', () => {
    const base = settingsFor('selector', {
      size: 'medium',
      thinking: false,
      forceFormat: true,
    });
    expect(configId('selector', base)).toBe(
      configId('selector', { ...base, seed: 3, timeoutMs: 1 }),
    );
    expect(configId('selector', base)).not.toBe(
      configId('selector', { ...base, temperature: 0 }),
    );
    expect(configId('selector', base)).not.toBe(
      configId('selector', { ...base, forceFormat: false }),
    );
    expect(configId('selector', base)).not.toBe(configId('verifier', base));
  });
});

describe('comparing two configurations case by case', () => {
  const runs = (passing: Array<string>, failing: Array<string>) => [
    ...passing.map((caseId) => row({ caseId })),
    ...failing.map((caseId) => row({ caseId, pass: false })),
  ];
  it('calls a difference real only with six or more cases, all one way', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(
      paired(runs(all, []), runs(['g', 'h'], ['a', 'b', 'c', 'd', 'e', 'f']))
        .real,
    ).toBe(true);
    expect(
      paired(runs(all, []), runs(['f', 'g', 'h'], ['a', 'b', 'c', 'd', 'e']))
        .real,
    ).toBe(false);
  });
  it('does not call it real when the differences go both ways', () => {
    const p = paired(
      runs(['a', 'b', 'c', 'd', 'e', 'f'], ['g']),
      runs(['g'], ['a', 'b', 'c', 'd', 'e', 'f']),
    );
    expect(p).toMatchObject({ onlyA: 6, onlyB: 1, real: false });
  });
});
