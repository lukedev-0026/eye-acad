import { upperMedian } from '@/common/stats';
import type { StepId } from '@/domain/llm/step-settings.schema';
import { configId } from '@/eval/run/config-id';
import type { ResultRow } from '@/eval/run/result-row';
import { summarise } from '@/eval/run/summarise';
import type { Summary } from '@/eval/run/summarise';
import type { Ranked } from '@/eval/sweep/choosing-rule';
import { CEILING_MS, sizeOf, startSettings } from '@/eval/sweep/grid';
import type { SweepData } from '@/eval/sweep/sweep-data';
import type { Preflight } from '@/eval/sweep/sweep-rows.schema';

const COLUMNS = [
  'run_id',
  'date_utc',
  'commit',
  'stage',
  'split',
  'provider',
  'step',
  'config_id',
  'block',
  'model',
  'model_digest',
  'engine',
  'size',
  'temperature',
  'sampling',
  'thinking',
  'median_thinking_chars',
  'forced_format',
  'format_canary',
  'prompt',
  'prompt_fingerprint',
  'num_ctx',
  'output_cap',
  'cases_n',
  'runs_per_case',
  'cases_all_pass_k',
  'cases_flipped',
  'runs_passed',
  'runs_counted',
  'costly_errors',
  'fallbacks',
  'truncated',
  'schema_invalid',
  'refusals',
  'infra_errors',
  'second_count_k',
  'second_count_n',
  'left_out_as_either',
  'human_graded',
  'timed_calls',
  'median_ms',
  'min_ms',
  'max_ms',
  'median_output_tokens',
  'cold_load_ms',
  'ollama_version',
  'power_mode',
  'case_file_hash',
  'status',
  'eligible',
  'is_start',
  'is_chosen',
] as const;
type Column = (typeof COLUMNS)[number];

export interface CsvMeta {
  readonly runId: string;
  readonly preflight: Preflight;
  readonly caseHashes: Partial<Record<StepId, string>>;
  readonly promptFingerprints: Record<string, Record<string, string>>;
}

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function csvRow(
  data: SweepData,
  chosen: Partial<Record<StepId, Ranked>>,
  meta: CsvMeta,
  cfgId: string,
  stage: string,
  split: string,
  rows: Array<ResultRow>,
  s: Summary,
): string | null {
  const cfg = data.configs.get(cfgId);
  if (!cfg) return null;
  const st = cfg.settings;
  const step = cfg.step;
  const run = data.runs[0];
  const info = data.modelLoads.find((load) => load.model === st.model);
  const canaryKey = `thinking ${st.thinking ? 'on' : 'off'}, format ${st.forceFormat ? 'forced' : 'not forced'}`;
  const isChosen = chosen[step]?.configId === cfgId;
  const tooSlow = s.medianMs === null || s.medianMs > CEILING_MS[step];
  const row: Record<Column, string | number> = {
    run_id: meta.runId,
    date_utc: rows[0]?.at.slice(0, 10) ?? '',
    commit: run?.env?.commit ?? '',
    stage,
    split,
    provider: st.provider,
    step,
    config_id: cfgId,
    block: cfg.block,
    model: st.model,
    model_digest: info?.info?.digest ?? '',
    engine: info?.info?.engine ?? '',
    size: sizeOf(st.model),
    temperature: st.temperature ?? '',
    sampling: JSON.stringify(st.sampling ?? {}),
    thinking: st.thinking ? 'on' : 'off',
    median_thinking_chars: upperMedian(rows.map((r) => r.thinkingChars)) ?? '',
    forced_format: st.forceFormat ? 'on' : 'off',
    format_canary:
      meta.preflight.models?.[st.model]?.canaries?.[canaryKey]?.outcome ?? '',
    prompt: st.promptVariant,
    prompt_fingerprint: meta.promptFingerprints[step]?.[st.promptVariant] ?? '',
    num_ctx: st.numCtx ?? '',
    output_cap: st.maxOutputTokens,
    cases_n: s.cases,
    runs_per_case: s.trialsPerCase,
    cases_all_pass_k: s.casesAllPass,
    cases_flipped: s.casesFlipped,
    runs_passed: s.trialsPassed,
    runs_counted: s.trialsCounted,
    costly_errors: s.costly,
    fallbacks: s.fallbacks,
    truncated: s.truncated,
    schema_invalid: s.schemaInvalid,
    refusals: s.refusals,
    infra_errors: s.infraErrors,
    second_count_k: s.secondaryN ? s.secondaryK : '',
    second_count_n: s.secondaryN || '',
    left_out_as_either: s.secondaryN ? s.secondaryLeftOut : '',
    human_graded: 'no',
    timed_calls: s.timedCalls,
    median_ms: s.medianMs ?? '',
    min_ms: s.minMs ?? '',
    max_ms: s.maxMs ?? '',
    median_output_tokens: s.medianOutputTokens ?? '',
    cold_load_ms: info?.loadAndWarmUpMs ?? '',
    ollama_version: run?.env?.ollamaVersion ?? '',
    power_mode: run?.env?.powerMode ?? '',
    case_file_hash: meta.caseHashes[step] ?? '',
    status: data.stopped.has(cfgId) ? 'stopped' : 'complete',
    eligible:
      !data.stopped.has(cfgId) && !tooSlow && s.costly === 0 ? 'yes' : 'no',
    is_start: configId(step, startSettings(step)) === cfgId ? 'yes' : 'no',
    is_chosen: isChosen ? 'yes' : 'no',
  };
  return COLUMNS.map((column) => csvCell(row[column])).join(',');
}

export function resultsCsv(
  data: SweepData,
  chosen: Partial<Record<StepId, Ranked>>,
  meta: CsvMeta,
): Array<string> {
  const lines: Array<string> = [COLUMNS.join(',')];
  const add = (
    cfgId: string,
    stage: string,
    split: string,
    rows: Array<ResultRow>,
  ): void => {
    const line = csvRow(
      data,
      chosen,
      meta,
      cfgId,
      stage,
      split,
      rows,
      summarise(rows),
    );
    if (line !== null) lines.push(line);
  };
  for (const cfg of data.configs.values()) {
    const mine = data.results.filter(
      (r) => r.configId === cfg.configId && r.step === cfg.step,
    );
    const pick = (stages: Array<string>, split: string): Array<ResultRow> =>
      mine.filter((r) => stages.includes(r.stage) && r.split === split);
    const screen = pick(['screen'], 'tune');
    if (screen.length) add(cfg.configId, 'screen', 'tune', screen);
    if (mine.some((r) => r.stage === 'confirm'))
      add(cfg.configId, 'confirm', 'tune', pick(['screen', 'confirm'], 'tune'));
    const held = pick(['holdout'], 'holdout');
    if (held.length) add(cfg.configId, 'holdout', 'holdout', held);
  }
  return lines;
}
