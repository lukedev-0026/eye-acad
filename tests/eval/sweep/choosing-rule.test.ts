import { describe, expect, it } from 'vitest';

import { itemAt } from '@/common/arrays';
import type { Summary } from '@/eval/run/summarise';
import { limitModels, rank, tieBand } from '@/eval/sweep/choosing-rule';
import type { Candidate } from '@/eval/sweep/choosing-rule';
import { settingsFor } from '@/eval/sweep/grid';

const summary = (over: Partial<Summary>): Summary => ({
  cases: 20,
  trialsPerCase: 3,
  casesAllPass: 20,
  casesFlipped: 0,
  trialsPassed: 60,
  trialsCounted: 60,
  costly: 0,
  fallbacks: 0,
  truncated: 0,
  schemaInvalid: 0,
  refusals: 0,
  infraErrors: 0,
  medianMs: 1000,
  minMs: 800,
  maxMs: 1500,
  timedCalls: 60,
  medianOutputTokens: 40,
  secondaryK: 0,
  secondaryN: 0,
  secondaryLeftOut: 0,
  ...over,
});
const cand = (id: string, o: Parameters<typeof settingsFor>[1], s: Partial<Summary>): Candidate => ({
  configId: id,
  settings: settingsFor('selector', o),
  summary: summary(s),
});

describe('the choosing rule', () => {
  it('a costly error rules a configuration out, however accurate it is', () => {
    const r = rank('selector', [
      cand(
        'accurate-but-costly',
        { size: 'large', thinking: false, forceFormat: true },
        { casesAllPass: 20, costly: 1 },
      ),
      cand('clean', { size: 'medium', thinking: false, forceFormat: true }, { casesAllPass: 17 }),
    ]);
    expect(r[0]?.configId).toBe('clean');
    expect(r[1]?.eligible).toBe(false);
  });
  it('over the speed ceiling is out', () => {
    const r = rank('selector', [
      cand('slow', { size: 'large', thinking: true, forceFormat: true }, { casesAllPass: 20, medianMs: 9000 }),
      cand('fast', { size: 'small', thinking: false, forceFormat: true }, { casesAllPass: 16, medianMs: 600 }),
    ]);
    expect(r[0]?.configId).toBe('fast');
  });
  it('within one case counts as tied, and the faster one wins the tie', () => {
    expect(tieBand(20)).toBe(1);
    const r = rank('selector', [
      cand('20-slow', { size: 'large', thinking: false, forceFormat: true }, { casesAllPass: 20, medianMs: 1800 }),
      cand('19-fast', { size: 'small', thinking: false, forceFormat: true }, { casesAllPass: 19, medianMs: 500 }),
      cand('17-fastest', { size: 'small', thinking: false, forceFormat: false }, { casesAllPass: 17, medianMs: 300 }),
    ]);
    expect(r.map((c) => c.configId)).toEqual(['19-fast', '20-slow', '17-fastest']);
    expect(r[2]?.tier).toBeGreaterThan(1);
  });
  it('a few milliseconds do not decide a tie: the next tie-break does', () => {
    const r = rank('selector', [
      cand('unforced-519', { size: 'small', thinking: false, forceFormat: false }, { casesAllPass: 19, medianMs: 519 }),
      cand('forced-536', { size: 'small', thinking: false, forceFormat: true }, { casesAllPass: 19, medianMs: 536 }),
    ]);
    expect(r[0]?.configId).toBe('forced-536');
  });
  it('a clear difference in accuracy beats speed', () => {
    const r = rank('selector', [
      cand('fast-weak', { size: 'small', thinking: false, forceFormat: true }, { casesAllPass: 14, medianMs: 300 }),
      cand(
        'slower-strong',
        { size: 'medium', thinking: false, forceFormat: true },
        { casesAllPass: 19, medianMs: 1200 },
      ),
    ]);
    expect(r[0]?.configId).toBe('slower-strong');
  });
  it('when everything has a costly error, the fewest wins and none is called eligible', () => {
    const r = rank('selector', [
      cand('two', { size: 'medium', thinking: false, forceFormat: true }, { costly: 2 }),
      cand('one', { size: 'small', thinking: false, forceFormat: true }, { costly: 1, casesAllPass: 15 }),
    ]);
    expect(r[0]?.configId).toBe('one');
    expect(r.every((c) => !c.eligible)).toBe(true);
  });
  it('a stopped configuration is never chosen', () => {
    const r = rank('selector', [
      {
        ...cand('stopped', { size: 'large', thinking: true, forceFormat: true }, { cases: 10, casesAllPass: 10 }),
        stopped: true,
      },
      cand('ok', { size: 'medium', thinking: false, forceFormat: true }, { casesAllPass: 12 }),
    ]);
    expect(r[0]?.configId).toBe('ok');
  });
});

describe('at most two models', () => {
  it('moves the step on the least-used model onto one of the others', () => {
    const mk = (id: string, size: 'small' | 'medium' | 'large') =>
      itemAt(rank('selector', [cand(id, { size, thinking: false, forceFormat: true }, {})]), 0);
    const ranked = {
      selector: [mk('s-small', 'small'), mk('s-medium', 'medium')],
      followup: [mk('f-medium', 'medium')],
      coverage: [mk('c-large', 'large'), mk('c-medium', 'medium')],
      revision: [mk('r-large', 'large')],
      verifier: [mk('v-medium', 'medium')],
    };
    const { chosen, changed } = limitModels(ranked);
    expect(changed).toEqual(['selector']);
    expect(chosen.selector.configId).toBe('s-medium');
    expect(new Set(Object.values(chosen).map((c) => c.settings.model)).size).toBe(2);
  });
});
