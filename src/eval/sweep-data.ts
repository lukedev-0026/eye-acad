import type { StepId, StepSettings } from '../server/llm/types'
import { readRows, resultsFile, rowKey, summarise } from './run'
import type { ResultRow, Summary } from './run'
import type { Candidate } from './rule'

// Everything the sweep has recorded so far, read back from its results file.
// The runner uses it to resume; the report and the chart use nothing else.

export type ConfigRow = { type: 'config'; configId: string; step: StepId; settings: StepSettings; block: string }
export type StatusRow = { type: 'config_status'; configId: string; stage: string; status: 'complete' | 'stopped' }

export type SweepData = {
  rows: Array<Record<string, unknown>>
  results: Array<ResultRow>
  configs: Map<string, ConfigRow>
  done: Set<string>
  stopped: Set<string>
}

export async function loadSweep(runId: string): Promise<SweepData> {
  const rows = await readRows(resultsFile(runId))
  const results = rows.filter((r) => r.type === 'result') as unknown as Array<ResultRow>
  const configs = new Map<string, ConfigRow>()
  for (const r of rows) if (r.type === 'config') configs.set((r as ConfigRow).configId, r as ConfigRow)
  return {
    rows,
    results,
    configs,
    done: new Set(results.map((r) => rowKey(r.stage, r.configId, r.caseId, r.trial))),
    stopped: new Set(
      rows.filter((r) => r.type === 'config_status' && (r as StatusRow).status === 'stopped').map((r) => (r as StatusRow).configId),
    ),
  }
}

// One configuration's results on the tuning cases. `stages` picks the runs:
// ['screen'] is the single screening run that the chart shows for every dot;
// ['screen', 'confirm'] adds the two further runs made for the finalists.
export function candidatesFor(data: SweepData, step: StepId, stages: Array<string>, split = 'tune'): Array<Candidate & { block: string; summary: Summary }> {
  const out: Array<Candidate & { block: string }> = []
  for (const cfg of data.configs.values()) {
    if (cfg.step !== step) continue
    const mine = data.results.filter(
      (r) => r.configId === cfg.configId && r.step === step && stages.includes(r.stage) && r.split === split,
    )
    if (!mine.length) continue
    out.push({
      configId: cfg.configId,
      settings: cfg.settings,
      summary: summarise(mine),
      stopped: data.stopped.has(cfg.configId),
      block: cfg.block,
    })
  }
  return out
}
