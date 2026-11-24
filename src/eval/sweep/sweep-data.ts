import type { StepId } from '@/domain/llm/step-settings.schema';
import type { EvalCase, EvalContext } from '@/eval/eval.types';
import { resultsFile } from '@/eval/paths';
import { ResultRowSchema, rowKey } from '@/eval/run/result-row';
import type { ResultRow } from '@/eval/run/result-row';
import { parseRow, readRows } from '@/eval/run/results.store';
import { summarise } from '@/eval/run/summarise';
import type { Summary } from '@/eval/run/summarise';
import { STEP_EVALS } from '@/eval/steps/registry';

import type { Candidate } from './choosing-rule';
import { ConfigRowSchema, ModelLoadedRowSchema, RunRowSchema, StatusRowSchema } from './sweep-rows.schema';
import type { ConfigRow, ModelLoadedRow, RunRow } from './sweep-rows.schema';

// Everything the sweep has recorded so far, read back from its results file.
// The runner uses it to resume; the report and the chart use nothing else.
export interface SweepData {
  readonly results: Array<ResultRow>;
  readonly configs: Map<string, ConfigRow>;
  readonly runs: Array<RunRow>;
  readonly modelLoads: Array<ModelLoadedRow>;
  // Keys of the calls already made, so a restarted run skips them.
  readonly done: Set<string>;
  // Configurations stopped early as far too slow.
  readonly stopped: Set<string>;
}

export async function loadSweep(runId: string): Promise<SweepData> {
  const file = resultsFile(runId);
  const rows = await readRows(file);
  const data: SweepData = {
    results: [],
    configs: new Map(),
    runs: [],
    modelLoads: [],
    done: new Set(),
    stopped: new Set(),
  };
  rows.forEach((row, i) => {
    const line = i + 1;
    switch (row.type) {
      case 'result': {
        const result = parseRow(ResultRowSchema, row, file, line);
        data.results.push(result);
        data.done.add(rowKey(result.stage, result.configId, result.caseId, result.trial));
        break;
      }
      case 'config': {
        const config = parseRow(ConfigRowSchema, row, file, line);
        data.configs.set(config.configId, config);
        break;
      }
      case 'config_status': {
        const status = parseRow(StatusRowSchema, row, file, line);
        if (status.status === 'stopped') data.stopped.add(status.configId);
        break;
      }
      case 'run':
        data.runs.push(parseRow(RunRowSchema, row, file, line));
        break;
      case 'model_loaded':
        data.modelLoads.push(parseRow(ModelLoadedRowSchema, row, file, line));
        break;
      default:
        // Other kinds of row (the end of a run, a self-test) are kept as saved.
        break;
    }
  });
  return data;
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
