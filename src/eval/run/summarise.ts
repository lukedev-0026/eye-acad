import { median } from '@/common/stats';
import type { CallOutcome } from '@/domain/llm/call-result';

import type { ChainRow, ResultRow } from './result-row';

// How one configuration did on one set of cases. n is the number of CASES and
// k the number that passed on every run: twenty cases run three times is 20,
// never 60.
export interface Summary {
  cases: number;
  trialsPerCase: number;
  casesAllPass: number;
  casesFlipped: number;
  trialsPassed: number;
  trialsCounted: number;
  costly: number;
  fallbacks: number;
  truncated: number;
  schemaInvalid: number;
  refusals: number;
  infraErrors: number;
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  timedCalls: number;
  medianOutputTokens: number | null;
  secondaryK: number;
  secondaryN: number;
  secondaryLeftOut: number;
}

export function summarise(rows: ReadonlyArray<ResultRow | ChainRow>): Summary {
  // A call that never reached the model says nothing about the configuration.
  const counted = rows.filter((r) => r.outcome !== 'infra_error');
  const byCase = new Map<string, Array<ResultRow | ChainRow>>();
  for (const r of counted) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);
  const groups = [...byCase.values()];
  const timed = counted.filter((r) => r.calls > 0).map((r) => r.ms);
  const count = (outcome: CallOutcome) => rows.filter((r) => r.outcome === outcome).length;
  return {
    cases: groups.length,
    trialsPerCase: Math.max(0, ...groups.map((g) => g.length)),
    casesAllPass: groups.filter((g) => g.every((r) => r.pass)).length,
    casesFlipped: groups.filter((g) => g.some((r) => r.pass) && g.some((r) => !r.pass)).length,
    trialsPassed: counted.filter((r) => r.pass).length,
    trialsCounted: counted.length,
    costly: counted.filter((r) => r.costly).length,
    fallbacks: counted.filter((r) => r.fallback).length,
    truncated: count('truncated'),
    schemaInvalid: count('schema_invalid'),
    refusals: count('refusal'),
    infraErrors: count('infra_error'),
    medianMs: median(timed),
    minMs: timed.length ? Math.min(...timed) : null,
    maxMs: timed.length ? Math.max(...timed) : null,
    timedCalls: timed.length,
    medianOutputTokens: median(counted.filter((r) => r.calls > 0).map((r) => r.outputTokens)),
    secondaryK: counted.reduce((n, r) => n + (r.secondary?.k ?? 0), 0),
    secondaryN: counted.reduce((n, r) => n + (r.secondary?.n ?? 0), 0),
    secondaryLeftOut: counted.reduce((n, r) => n + (r.secondary?.leftOut ?? 0), 0),
  };
}
