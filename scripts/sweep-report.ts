// Turns the sweep's recorded calls into evals/sweep/results.csv, applies the
// rule in evals/sweep/RULE.md, and prints the choice.
//   pnpm sweep:report            write the CSV and print the ranking
//   pnpm sweep:report --apply    also write the chosen settings to config/steps.json
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { CEILING_MS, describe, sizeOf, startSettings } from '../src/eval/grid'
import { limitModels, rank, tieBand } from '../src/eval/rule'
import type { Ranked } from '../src/eval/rule'
import { configId, summarise } from '../src/eval/run'
import type { ResultRow, Summary } from '../src/eval/run'
import { loadContext } from '../src/eval/context'
import { candidatesFor, loadSweep, regrade } from '../src/eval/sweep-data'
import { sweepMarkdown } from '../src/eval/sweep-markdown'
import { loadStepsConfig } from '../src/server/config.server'
import { STEP_IDS } from '../src/server/llm/types'
import type { StepId, StepSettings } from '../src/server/llm/types'

const { values: args } = parseArgs({
  options: { 'run-id': { type: 'string', default: 'sweep-ollama' }, apply: { type: 'boolean', default: false } },
})
const runId = args['run-id']!
const data = await loadSweep(runId)
if (!data.results.length) {
  console.error(`No results recorded under evals/results/${runId}.jsonl yet.`)
  process.exit(1)
}
// Every stored reply is scored against the case files as they are now.
const regraded = await regrade(data, await loadContext())
if (regraded.changed) {
  console.log(`Note: ${regraded.changed} stored verdicts differ from the ones recorded at run time, because an expected answer has been corrected since. Corrections are listed in evals/cases/CORRECTIONS.md.`)
}

const runRow = data.rows.find((r) => r.type === 'run') as { env?: { commit: string; ollamaVersion: string; powerMode: string; machine: string } } | undefined
const loads = data.rows.filter((r) => r.type === 'model_loaded') as Array<{ model: string; loadAndWarmUpMs: number; info?: { digest: string; engine: string; quantisation: string } }>
const infoOf = (model: string) => loads.find((l) => l.model === model)
let preflight: { models?: Record<string, { canaries?: Record<string, { outcome: string }> }> } = {}
try {
  preflight = JSON.parse(await readFile('evals/sweep/preflight.json', 'utf8'))
} catch {
  // no preflight file
}
const hashFile = async (file: string) => {
  try {
    return createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 10)
  } catch {
    return ''
  }
}

let current: Record<StepId, StepSettings> | null = null
try {
  current = (await loadStepsConfig()).steps
} catch {
  // not chosen yet
}

// ---------- the rule ----------

const ranked = {} as Record<StepId, Array<Ranked>>
const stepsWithData: Array<StepId> = []
for (const step of STEP_IDS) {
  // The rule is applied to configurations that had the confirmation runs. If
  // none has yet, the screening run is all there is, and the report says so.
  const confirmed = candidatesFor(data, step, ['screen', 'confirm']).filter((c) => c.summary.trialsPerCase >= 3 || (c.settings.temperature === 0 && c.summary.trialsPerCase >= 1 && data.results.some((r) => r.configId === c.configId && r.stage === 'confirm')))
  const pool = confirmed.length ? confirmed : candidatesFor(data, step, ['screen'])
  if (!pool.length) continue
  stepsWithData.push(step)
  ranked[step] = rank(step, pool)
}
const { chosen, changed } =
  stepsWithData.length === STEP_IDS.length ? limitModels(ranked) : { chosen: Object.fromEntries(stepsWithData.map((s) => [s, ranked[s][0]])) as Record<StepId, Ranked>, changed: [] as Array<StepId> }

// ---------- the CSV ----------

const COLUMNS = [
  'run_id', 'date_utc', 'commit', 'stage', 'split', 'provider', 'step', 'config_id', 'block', 'model', 'model_digest', 'engine', 'size',
  'temperature', 'sampling', 'thinking', 'median_thinking_chars', 'forced_format', 'format_canary', 'prompt', 'prompt_file_hash',
  'num_ctx', 'output_cap', 'cases_n', 'runs_per_case', 'cases_all_pass_k', 'cases_flipped', 'runs_passed', 'runs_counted',
  'costly_errors', 'fallbacks', 'truncated', 'schema_invalid', 'refusals', 'infra_errors', 'second_count_k', 'second_count_n',
  'left_out_as_either', 'human_graded', 'timed_calls', 'median_ms', 'min_ms', 'max_ms', 'median_output_tokens', 'cold_load_ms',
  'ollama_version', 'power_mode', 'case_file_hash', 'status', 'eligible', 'is_start', 'is_chosen',
] as const

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const medianOf = (v: Array<number>) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : '')

const lines: Array<string> = [COLUMNS.join(',')]
const caseHash: Record<string, string> = {}
const promptHash: Record<string, string> = {}
for (const step of STEP_IDS) {
  caseHash[step] = await hashFile(`evals/cases/${step}.jsonl`)
  promptHash[step] = await hashFile(`src/server/prompts/${step}.ts`)
}

function addRow(cfgId: string, stage: string, split: string, rows: Array<ResultRow>, s: Summary) {
  const cfg = data.configs.get(cfgId)!
  const st = cfg.settings
  const step = cfg.step
  const info = infoOf(st.model)
  const canaryKey = `thinking ${st.thinking ? 'on' : 'off'}, format ${st.forceFormat ? 'forced' : 'not forced'}`
  const isChosen = chosen[step]?.configId === cfgId
  const tooSlow = s.medianMs === null || s.medianMs > CEILING_MS[step]
  const row: Record<(typeof COLUMNS)[number], unknown> = {
    run_id: runId,
    date_utc: rows[0]?.at.slice(0, 10) ?? '',
    commit: runRow?.env?.commit ?? '',
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
    median_thinking_chars: medianOf(rows.map((r) => r.thinkingChars)),
    forced_format: st.forceFormat ? 'on' : 'off',
    format_canary: preflight.models?.[st.model]?.canaries?.[canaryKey]?.outcome ?? '',
    prompt: st.promptVariant,
    prompt_file_hash: promptHash[step],
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
    ollama_version: runRow?.env?.ollamaVersion ?? '',
    power_mode: runRow?.env?.powerMode ?? '',
    case_file_hash: caseHash[step],
    status: data.stopped.has(cfgId) ? 'stopped' : 'complete',
    eligible: !data.stopped.has(cfgId) && !tooSlow && s.costly === 0 ? 'yes' : 'no',
    is_start: configId(step, startSettings(step)) === cfgId ? 'yes' : 'no',
    is_chosen: isChosen ? 'yes' : 'no',
  }
  lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','))
}

for (const cfg of data.configs.values()) {
  const mine = data.results.filter((r) => r.configId === cfg.configId && r.step === cfg.step)
  const pick = (stages: Array<string>, split: string) => mine.filter((r) => stages.includes(r.stage) && r.split === split)
  const screen = pick(['screen'], 'tune')
  if (screen.length) addRow(cfg.configId, 'screen', 'tune', screen, summarise(screen))
  if (mine.some((r) => r.stage === 'confirm')) {
    const both = pick(['screen', 'confirm'], 'tune')
    addRow(cfg.configId, 'confirm', 'tune', both, summarise(both))
  }
  const held = pick(['holdout'], 'holdout')
  if (held.length) addRow(cfg.configId, 'holdout', 'holdout', held, summarise(held))
}
await writeFile('evals/sweep/results.csv', `${lines.join('\n')}\n`)

// ---------- what it says ----------

console.log(`Sweep ${runId}: ${data.results.length} calls, ${data.configs.size} configurations. Wrote evals/sweep/results.csv (${lines.length - 1} rows).\n`)

const sentinels = [...new Set(data.results.filter((r) => r.stage.startsWith('sentinel')).map((r) => r.stage))].sort()
let driftNote: string | null = null
if (sentinels.length) {
  const medians = sentinels.map((stage) => summarise(data.results.filter((r) => r.stage === stage)).medianMs ?? 0)
  const drift = Math.round(((Math.max(...medians) - Math.min(...medians)) / Math.min(...medians)) * 100)
  driftNote = `the same ten calls, repeated through the run: ${sentinels.map((s, i) => `${s.replace('sentinel-', '')} ${medians[i]} ms`).join(', ')}. Drift ${drift}%${drift > 20 ? ' — over 20%, so timings are flagged' : ''}.`
  console.log(`Timing reference: ${driftNote}\n`)
}
const confirmedSteps = stepsWithData.filter((step) => ranked[step].some((c) => data.results.some((r) => r.configId === c.configId && r.stage === 'confirm')))
await writeFile('evals/sweep/RESULTS.md', `${sweepMarkdown(data, ranked, chosen, { changed, drift: driftNote, confirmedSteps })}\n`)

for (const step of stepsWithData) {
  const list = ranked[step]
  const confirmed = list.some((c) => c.summary.trialsPerCase >= 3)
  console.log(`${step}  (ceiling ${CEILING_MS[step]} ms; tied within ${tieBand(Math.max(...list.map((c) => c.summary.cases)))} case; ${confirmed ? 'confirmation runs' : 'SCREENING RUN ONLY — not yet confirmed'})`)
  for (const c of list.slice(0, 6)) {
    const mark = chosen[step].configId === c.configId ? '=> ' : '   '
    console.log(
      `${mark}${String(c.summary.casesAllPass).padStart(2)}/${c.summary.cases} cases, flipped ${c.summary.casesFlipped}, costly ${c.summary.costly}, fallback ${c.summary.fallbacks}, ` +
        `${String(c.summary.medianMs).padStart(6)} ms  tier ${c.tier === 1000 ? '-' : c.tier}  ${describe(c.settings)}  [${c.why}]`,
    )
  }
  if (!list[0].eligible) console.log('   NOTE: no configuration is eligible for this step; the fewest costly errors was used.')
  if (changed.includes(step)) console.log('   NOTE: moved off its first choice to keep the app to two models.')
  console.log()
}

if (stepsWithData.length === STEP_IDS.length) {
  const models = [...new Set(STEP_IDS.map((s) => chosen[s].settings.model))]
  console.log(`Chosen by the rule: ${models.length} model(s): ${models.join(', ')}`)
  const steps = Object.fromEntries(STEP_IDS.map((s) => [s, { ...chosen[s].settings, seed: undefined }]))
  const same = current && STEP_IDS.every((s) => configId(s, current![s]) === chosen[s].configId)
  console.log(same ? 'config/steps.json already holds exactly this.' : 'config/steps.json does NOT hold this yet.')
  if (args.apply) {
    await writeFile('config/steps.json', `${JSON.stringify({ steps }, null, 2)}\n`)
    console.log('Wrote config/steps.json.')
  }
}
