import type { StepId, StepSettings } from '../server/llm/types';
import { STEP_EVALS } from './registry';
import type { Candidate } from './rule';
import { readRows, resultsFile, rowKey, summarise } from './run';
import type { ResultRow, Summary } from './run';
import type { EvalCase, EvalContext } from './types';

// Everything the sweep has recorded so far, read back from its results file.
// The runner uses it to resume; the report and the chart use nothing else.

export type ConfigRow = { type: 'config'; configId: string; step: StepId; settings: StepSettings; block: string };
export type StatusRow = { type: 'config_status'; configId: string; stage: string; status: 'complete' | 'stopped' };

export type SweepData = {
  rows: Array<Record<string, unknown>>;
  results: Array<ResultRow>;
  configs: Map<string, ConfigRow>;
  done: Set<string>;
  stopped: Set<string>;
};

export async function loadSweep(runId: string): Promise<SweepData> {
  const rows = await readRows(resultsFile(runId));
  const results = rows.filter((r) => r.type === 'result') as unknown as Array<ResultRow>;
  const configs = new Map<string, ConfigRow>();
  for (const r of rows) if (r.type === 'config') configs.set((r as ConfigRow).configId, r as ConfigRow);
  return {
    rows,
    results,
    configs,
    done: new Set(results.map((r) => rowKey(r.stage, r.configId, r.caseId, r.trial))),
    stopped: new Set(
      rows
        .filter((r) => r.type === 'config_status' && (r as StatusRow).status === 'stopped')
        .map((r) => (r as StatusRow).configId),
    ),
  };
}

// One configuration's results on the tuning cases. `stages` picks the runs:
// ['screen'] is the single screening run that the chart shows for every dot;
// ['screen', 'confirm'] adds the two further runs made for the finalists.
export function candidatesFor(
  data: SweepData,
  step: StepId,
  stages: Array<string>,
  split = 'tune',
): Array<Candidate & { block: string; summary: Summary }> {
  const out: Array<Candidate & { block: string }> = [];
  for (const cfg of data.configs.values()) {
    if (cfg.step !== step) continue;
    const mine = data.results.filter(
      (r) => r.configId === cfg.configId && r.step === step && stages.includes(r.stage) && r.split === split,
    );
    if (!mine.length) continue;
    out.push({
      configId: cfg.configId,
      settings: cfg.settings,
      summary: summarise(mine),
      stopped: data.stopped.has(cfg.configId),
      block: cfg.block,
    });
  }
  return out;
}

// Re-scores every stored reply against the case files as they are now. The
// results file keeps what each model actually produced, so correcting an
// expected answer never needs the models to be run again, and every
// configuration is re-scored the same way. Returns how many verdicts changed.
export async function regrade(data: SweepData, ctx: EvalContext): Promise<{ changed: number; missing: number }> {
  const cases = new Map<string, EvalCase>();
  for (const [step, evalDef] of Object.entries(STEP_EVALS)) {
    for (const c of await evalDef.cases(ctx)) cases.set(`${step}|${c.id}`, c);
  }
  let changed = 0;
  let missing = 0;
  for (const row of data.results) {
    const c = cases.get(`${row.step}|${row.caseId}`);
    if (!c || row.observed === null || row.outcome === 'infra_error') {
      if (!c) missing++;
      continue;
    }
    const g = STEP_EVALS[row.step].grade(c, row.observed, ctx);
    const pass = row.outcome === 'ok' && g.pass;
    if (pass !== row.pass || g.costly !== row.costly || g.fallback !== row.fallback) changed++;
    row.pass = pass;
    row.costly = g.costly;
    row.fallback = g.fallback;
    row.detail = row.outcome === 'ok' ? g.detail : `${row.outcome}; ${g.detail}`;
    row.secondary = g.secondary;
    row.split = c.split;
  }
  return { changed, missing };
}
