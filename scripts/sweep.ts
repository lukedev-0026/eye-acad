// Runs the existing checks across many configurations of each AI step, one
// model call at a time, writing every call to evals/results/<run-id>.jsonl.
// It can be stopped and restarted: finished work is skipped.
//
//   pnpm sweep --plan                 show what would run and a time estimate
//   pnpm sweep                        screen every configuration, then confirm the best
//   pnpm sweep --budget-minutes 480   stop cleanly at a time budget
//   pnpm sweep --steps selector,verifier --sizes small,medium
//   pnpm sweep --holdout              (later) the held-back cases, once only
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { useCommandLineLogging } from '@/common/logging/logger.server';
import { getConfig } from '@/config/env.server';
import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import { loadContext } from '@/eval/eval-context';
import type { EvalCase } from '@/eval/eval.types';
import { appendRow, configId, rowKey, runCases, summarise } from '@/eval/run/run-cases';
import type { ResultRow } from '@/eval/run/run-cases';
import { captureEnv, modelInfo, swapUsedMb } from '@/eval/run-env';
import { STEP_EVALS } from '@/eval/steps/registry';
import { rank } from '@/eval/sweep/choosing-rule';
import {
  CEILING_MS,
  NUM_CTX,
  SIZES,
  block1,
  block2,
  describe,
  settingsFor,
  sizeOf,
  startSettings,
  withoutPenalty,
} from '@/eval/sweep/grid';
import type { Size } from '@/eval/sweep/grid';
import { candidatesFor, loadSweep } from '@/eval/sweep/sweep-data';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';
import { OllamaClient } from '@/infrastructure/llm/ollama-http';

useCommandLineLogging();

const { values: args } = parseArgs({
  options: {
    'run-id': { type: 'string', default: 'sweep-ollama' },
    steps: { type: 'string', default: STEP_IDS.join(',') },
    sizes: { type: 'string', default: 'small,medium,large' },
    'budget-minutes': { type: 'string', default: '540' },
    plan: { type: 'boolean', default: false },
    holdout: { type: 'boolean', default: false },
    'skip-block2': { type: 'boolean', default: false },
    'skip-confirm': { type: 'boolean', default: false },
    // The short sweep: see the comment where it runs.
    short: { type: 'boolean', default: false },
    'min-battery': { type: 'string', default: '12' },
  },
});
const runId = args['run-id']!;
const steps = args.steps!.split(',') as Array<StepId>;
const sizes = args.sizes!.split(',') as Array<Size>;
const deadline = Date.now() + Number(args['budget-minutes']) * 60_000;
const CONFIRM_TOP = 3;
const CONFIRM_TRIALS = 3;

if (args.holdout && !existsSync('evals/sweep/DECISION.md')) {
  console.error(
    'The held-back cases stay closed until evals/sweep/DECISION.md exists. They report on a choice; they do not make it.',
  );
  process.exit(1);
}

const ctx = await loadContext();
const tune: Record<string, Array<EvalCase>> = {};
const holdout: Record<string, Array<EvalCase>> = {};
for (const step of steps) {
  const all = await STEP_EVALS[step].cases(ctx);
  tune[step] = all.filter((c) => c.split === 'tune');
  holdout[step] = all.filter((c) => c.split === 'holdout');
}

class OutOfTime extends Error {}
class LowBattery extends Error {}

// The sweep can draw more power than a small charger supplies. It stops
// cleanly, between configurations, before the battery gets low.
function batteryPercent(): { percent: number | null; onMains: boolean } {
  try {
    const out = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' });
    const m = /(\d+)%/.exec(out);
    return { percent: m ? Number(m[1]) : null, onMains: /AC Power/.test(out) };
  } catch {
    return { percent: null, onMains: true };
  }
}
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

// ---------- models ----------

const ollama = new OllamaClient(getConfig().ollama.host);
const embeddingModel = getConfig().embeddings.model;
// The share of a loaded model that sits on the GPU, as Ollama reports it.
const onGpu = (m: { size?: number | null; size_vram?: number | null } | undefined) =>
  m?.size && m.size_vram != null ? `${Math.round((m.size_vram / m.size) * 100)}%` : null;

let current: string | null = null;
// One language model in memory at a time. Load time is recorded and kept out
// of every timing.
async function useModel(model: string) {
  if (current === model) return;
  for (const m of await ollama.loadedModels()) {
    if (m.name === model || m.name.startsWith(embeddingModel)) continue;
    await ollama.unload(m.name);
  }
  const started = performance.now();
  // Three calls that are not timed: the first loads the model.
  const selector = STEP_EVALS.selector;
  const warm = (await selector.cases(ctx)).slice(0, 3);
  for (const c of warm) {
    await selector.run(c, { ...startSettings('selector'), model, seed: 1 }, ctx);
  }
  const ps = (await ollama.loadedModels()).find((m) => m.name === model);
  await appendRow(runId, {
    type: 'model_loaded',
    at: new Date().toISOString(),
    model,
    info: await modelInfo(model),
    loadAndWarmUpMs: Math.round(performance.now() - started),
    onGpu: onGpu(ps) ?? 'unknown',
    swapUsedMb: swapUsedMb(),
  });
  log(
    `model ${model} loaded (${ps ? `${onGpu(ps) ?? 'unknown share'} on GPU` : 'not listed'}), swap ${swapUsedMb()} MB`,
  );
  current = model;
}

// ---------- one configuration ----------

let data = await loadSweep(runId);
const median = (v: Array<number>) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

async function runConfig(o: {
  step: StepId;
  settings: StepSettings;
  block: string;
  stage: string;
  cases: Array<EvalCase>;
  trials: number;
  firstTrial?: number;
}): Promise<void> {
  const cfg = configId(o.step, o.settings);
  if (!data.configs.has(cfg)) {
    const row = { type: 'config' as const, configId: cfg, step: o.step, settings: o.settings, block: o.block };
    await appendRow(runId, row);
    data.configs.set(cfg, row);
  }
  if (data.stopped.has(cfg)) return;
  const first = o.firstTrial ?? 1;
  const todo = o.cases.some((c) => {
    for (let t = first; t < first + o.trials; t++) if (!data.done.has(rowKey(o.stage, cfg, c.id, t))) return true;
    return false;
  });
  if (!todo) return;
  if (Date.now() > deadline) throw new OutOfTime();
  const battery = batteryPercent();
  if (battery.percent !== null && battery.percent < Number(args['min-battery']))
    throw new LowBattery(`battery at ${battery.percent}%`);

  await useModel(o.settings.model);
  const evalDef = STEP_EVALS[o.step];
  // One call that is not timed, so the first measured call is not the one
  // that pays for switching prompt or thinking mode.
  await evalDef.run(o.cases[0], { ...o.settings, seed: 1 }, ctx).catch(() => undefined);

  const started = Date.now();
  const { rows, stopped } = await runCases({
    evalDef,
    cases: o.cases,
    settings: o.settings,
    trials: o.trials,
    firstTrial: first,
    ctx,
    runId,
    stage: o.stage,
    done: data.done,
    // Far too slow to be usable: stop, and record it as stopped. Either every
    // one of the first three calls took more than twice the ceiling, or the
    // median of the first five did.
    shouldStop: (soFar: Array<ResultRow>) => {
      if (o.stage !== 'screen') return false;
      const timed = soFar.filter((r) => r.calls > 0).map((r) => r.ms);
      const limit = 2 * CEILING_MS[o.step];
      return (timed.length === 3 && Math.min(...timed) > limit) || (timed.length === 5 && median(timed) > limit);
    },
  });
  for (const r of rows) data.done.add(rowKey(r.stage, r.configId, r.caseId, r.trial));
  data.results.push(...rows);
  if (stopped) data.stopped.add(cfg);
  await appendRow(runId, {
    type: 'config_status',
    configId: cfg,
    stage: o.stage,
    status: stopped ? 'stopped' : 'complete',
  });
  const s = summarise(rows);
  log(
    `${o.step} [${o.stage}] ${describe(o.settings)}: ${s.casesAllPass}/${s.cases} cases, costly ${s.costly}, fallback ${s.fallbacks}, ` +
      `unusable ${s.truncated + s.schemaInvalid}, median ${s.medianMs} ms${stopped ? ' — STOPPED (too slow)' : ''} (${Math.round((Date.now() - started) / 1000)} s; battery ${batteryPercent().percent}%)`,
  );
}

// A fixed ten-call reference, repeated through the night. If its time drifts,
// the machine changed under the sweep and that night's timings are flagged.
async function sentinel(label: string) {
  const stage = `sentinel-${label}`;
  const settings = startSettings('selector');
  const cases = (await STEP_EVALS.selector.cases(ctx)).filter((c) => c.split === 'tune').slice(0, 10);
  if (cases.every((c) => data.done.has(rowKey(stage, configId('selector', settings), c.id, 1)))) return;
  await runConfig({ step: 'selector', settings, block: 'start', stage, cases, trials: 1 });
}

// ---------- the plan ----------

function screenCandidates(step: StepId) {
  return candidatesFor(data, step, ['screen']);
}

function block2For(step: StepId): Array<{ settings: StepSettings; block: string }> {
  const candidates = screenCandidates(step).filter((c) => c.block === 'block1' || c.block === 'start');
  const out: Array<{ settings: StepSettings; block: string }> = [];
  for (const size of sizes) {
    const ofSize = candidates.filter((c) => sizeOf(c.settings.model) === size);
    const best = rank(step, ofSize)[0];
    if (best && !best.stopped)
      for (const settings of block2(step, best.settings)) out.push({ settings, block: 'block2' });
  }
  const overall = rank(step, candidates)[0];
  out.push({ settings: withoutPenalty(step, startSettings(step)), block: 'probe' });
  if (overall && !overall.stopped) out.push({ settings: withoutPenalty(step, overall.settings), block: 'probe' });
  return out;
}

function finalists(step: StepId): Array<StepSettings> {
  const top = rank(step, screenCandidates(step))
    .filter((c) => !c.stopped)
    .slice(0, CONFIRM_TOP)
    .map((c) => c.settings);
  const start = startSettings(step);
  return top.some((s) => configId(step, s) === configId(step, start)) ? top : [...top, start];
}

if (args.plan) {
  let preflight: { models?: Record<string, { selectorMedianMs?: { thinkingOff: number; thinkingOn: number } }> } = {};
  try {
    preflight = JSON.parse(await readFile('evals/sweep/preflight.json', 'utf8'));
  } catch {
    // no probe yet
  }
  // Rough weight of one call of each step against one selector call, from
  // the first trial runs on the medium model.
  const weight: Record<StepId, number> = { selector: 1, verifier: 2, followup: 4, revision: 4, coverage: 8 };
  let calls = 0;
  let seconds = 0;
  for (const step of steps) {
    const n = tune[step].length;
    const b1 = sizes.length * 4;
    const b2 = sizes.length * 4 + 2;
    const confirm = (CONFIRM_TOP + 1) * (CONFIRM_TRIALS - 1);
    calls += n * (b1 + b2 + confirm);
    for (const size of sizes) {
      const probe = preflight.models?.[SIZES[size]]?.selectorMedianMs;
      const off = (probe?.thinkingOff ?? { small: 800, medium: 1300, large: 3500 }[size]) / 1000;
      const on = Math.min((probe?.thinkingOn ?? { small: 5000, medium: 12000, large: 40000 }[size]) / 1000, 60);
      // Thinking-on configurations over twice the ceiling stop after a few calls.
      const onCalls = on * weight[step] * 1000 > 2 * CEILING_MS[step] ? 4 : n;
      seconds += weight[step] * (2 * n * off + 2 * onCalls * on) + weight[step] * 4 * n * off;
    }
    seconds += weight[step] * confirm * n * 1.5;
    console.log(
      `${step}: ${n} tuning cases, ${holdout[step].length} held back. ${b1} + ${b2} configurations, ${CONFIRM_TOP} + start confirmed.`,
    );
  }
  console.log(
    `\nAbout ${calls} calls. Estimated ${Math.round(seconds / 360) / 10} hours, from ${preflight.models ? 'the preflight timing probe' : 'assumed speeds (no preflight yet)'}.`,
  );
  console.log(`Already recorded in ${runId}: ${data.results.length} calls.`);
  process.exit(0);
}

// ---------- run ----------

await appendRow(runId, {
  type: 'run',
  runId,
  at: new Date().toISOString(),
  env: await captureEnv(),
  argv: process.argv.slice(2),
  numCtx: NUM_CTX,
});

try {
  if (args.holdout) {
    // Opened once. The starting configuration and the chosen one, side by side.
    const chosen = await loadStepsConfig();
    for (const size of sizes) {
      for (const step of steps) {
        for (const [block, settings] of [
          ['start', startSettings(step)],
          ['chosen', chosen.steps[step]],
        ] as const) {
          if (sizeOf(settings.model) !== size) continue;
          await runConfig({ step, settings, block, stage: 'holdout', cases: holdout[step], trials: CONFIRM_TRIALS });
        }
      }
    }
  } else if (args.short) {
    // The short sweep, run after the full plan proved too heavy for the
    // machine's charger. One run per tuning case, thinking off throughout
    // (every thinking-on configuration already recorded was far over its
    // ceiling):
    //   medium: format forced and not forced; then, one change at a time from
    //           the starting configuration, the two other prompts and
    //           temperature 0
    //   large:  format forced, minimal prompt
    // The small model's block 1 was recorded in full before the cut.
    const planned: Array<{ step: StepId; settings: StepSettings; block: string }> = [];
    for (const step of steps) {
      const at = (o: Partial<Parameters<typeof settingsFor>[1]>) =>
        settingsFor(step, { size: 'medium', thinking: false, forceFormat: true, ...o });
      planned.push({ step, settings: at({}), block: 'start' });
      planned.push({ step, settings: at({ forceFormat: false }), block: 'block1' });
      planned.push({ step, settings: at({ prompt: 'rules' }), block: 'block2' });
      planned.push({ step, settings: at({ prompt: 'examples' }), block: 'block2' });
      planned.push({ step, settings: at({ temperature: 0 }), block: 'block2' });
    }
    // The one step where thinking was both affordable and useful on the small
    // model was the support check, so it gets a thinking-on run here too.
    if (steps.includes('verifier')) {
      planned.push({
        step: 'verifier',
        settings: settingsFor('verifier', { size: 'medium', thinking: true, forceFormat: true }),
        block: 'block1',
      });
    }
    for (const step of steps)
      planned.push({
        step,
        settings: settingsFor(step, { size: 'large', thinking: false, forceFormat: true }),
        block: 'block1',
      });
    for (const size of sizes) {
      if (size === 'medium') await sentinel('A');
      for (const p of planned) {
        if (sizeOf(p.settings.model) !== size) continue;
        await runConfig({
          step: p.step,
          settings: p.settings,
          block: p.block,
          stage: 'screen',
          cases: tune[p.step],
          trials: 1,
        });
      }
      if (size === 'medium') await sentinel('B');
    }
  } else {
    // Screen, block 1: size x thinking x forced format.
    for (const size of sizes) {
      if (size === 'medium') await sentinel('A');
      for (const step of steps) {
        for (const settings of block1(step, size)) {
          const isStart = configId(step, settings) === configId(step, startSettings(step));
          await runConfig({
            step,
            settings,
            block: isStart ? 'start' : 'block1',
            stage: 'screen',
            cases: tune[step],
            trials: 1,
          });
        }
      }
    }
    // Screen, block 2 and the probes: one change at a time from each size's best.
    if (!args['skip-block2']) {
      const planned = Object.fromEntries(steps.map((step) => [step, block2For(step)])) as Record<
        StepId,
        ReturnType<typeof block2For>
      >;
      for (const size of sizes) {
        if (size === 'medium') await sentinel('B');
        for (const step of steps) {
          for (const p of planned[step]) {
            if (sizeOf(p.settings.model) !== size) continue;
            await runConfig({
              step,
              settings: p.settings,
              block: p.block,
              stage: 'screen',
              cases: tune[step],
              trials: 1,
            });
          }
        }
      }
    }
    // Confirm: two more runs of the best three per step, and of the start.
    if (!args['skip-confirm']) {
      const planned = Object.fromEntries(steps.map((step) => [step, finalists(step)])) as Record<
        StepId,
        Array<StepSettings>
      >;
      for (const size of sizes) {
        if (size === 'medium') await sentinel('C');
        for (const step of steps) {
          for (const settings of planned[step]) {
            if (sizeOf(settings.model) !== size) continue;
            await runConfig({
              step,
              settings,
              block: 'confirm',
              stage: 'confirm',
              cases: tune[step],
              trials: CONFIRM_TRIALS - 1,
              firstTrial: 2,
            });
          }
        }
      }
    }
  }
  log('Finished.');
} catch (e) {
  if (e instanceof OutOfTime) log('Time budget reached. Run the same command again to carry on.');
  else if (e instanceof LowBattery)
    log(`Stopped: ${e.message}. Let it charge, then run the same command again to carry on.`);
  else throw e;
} finally {
  data = await loadSweep(runId);
  await appendRow(runId, {
    type: 'run_end',
    at: new Date().toISOString(),
    calls: data.results.length,
    swapUsedMb: swapUsedMb(),
  });
}
