import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { upperMedian } from '@/common/stats';
import { getConfig } from '@/config/env.server';
import type { StepId } from '@/domain/llm/step-settings.schema';
import type { Print } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { EvalRefusedError, LowBatteryError, OutOfTimeError } from '@/eval/eval.error';
import type { EvalCase, EvalContext } from '@/eval/eval.types';
import { PATHS } from '@/eval/paths';
import { configId } from '@/eval/run/config-id';
import { rowKey } from '@/eval/run/result-row';
import type { ResultRow } from '@/eval/run/result-row';
import { appendRow } from '@/eval/run/results.store';
import { runCases } from '@/eval/run/run-cases';
import { summarise } from '@/eval/run/summarise';
import { batteryState, captureEnv, modelInfo, swapUsedMb } from '@/eval/run-env';
import { STEP_EVALS } from '@/eval/steps/registry';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';
import { OllamaClient } from '@/infrastructure/llm/ollama-http';
import type { OllamaModel } from '@/infrastructure/llm/ollama.schema';

import { CEILING_MS, NUM_CTX, block1, describe, sizeOf, startSettings } from './grid';
import type { Size } from './grid';
import { loadSweep } from './sweep-data';
import type { SweepData } from './sweep-data';
import { CONFIRM_TRIALS, block2For, finalists, printPlan, shortPlan } from './sweep-plan';
import type { Planned } from './sweep-plan';
import { PreflightSchema } from './sweep-rows.schema';
import type { Preflight } from './sweep-rows.schema';

export interface SweepOptions {
  readonly runId: string;
  readonly steps: ReadonlyArray<StepId>;
  readonly sizes: ReadonlyArray<Size>;
  // The run stops cleanly, between configurations, when this much time has passed.
  readonly budgetMinutes: number;
  // ...or when the battery falls below this.
  readonly minBatteryPercent: number;
  // Print what would run, and run nothing.
  readonly plan: boolean;
  // The held-back cases, once, on the starting and the chosen settings.
  readonly holdout: boolean;
  // The cut-down plan: see shortPlan.
  readonly short: boolean;
  readonly skipBlock2: boolean;
  readonly skipConfirm: boolean;
  // The command line, recorded with the run.
  readonly argv: ReadonlyArray<string>;
}

interface ConfigRun extends Planned {
  readonly stage: string;
  readonly cases: Array<EvalCase>;
  readonly trials: number;
  readonly firstTrial?: number;
}

const WARM_UP_CALLS = 3;

// The share of a loaded model that sits on the GPU, as Ollama reports it.
const onGpu = (model: OllamaModel | undefined): string | null =>
  model?.size && model.size_vram != null ? `${Math.round((model.size_vram / model.size) * 100)}%` : null;

async function readPreflight(): Promise<Preflight> {
  try {
    return PreflightSchema.parse(JSON.parse(await readFile(PATHS.preflight, 'utf8')));
  } catch {
    // No pre-check yet: the plan falls back to assumed speeds.
    return {};
  }
}

// One run of the sweep. It holds what has been recorded so far, which model
// is in memory, and when to stop; everything it does is written to the
// results file as it happens, so a stopped run loses nothing and a restarted
// one skips what is done.
class SweepRun {
  private readonly options: SweepOptions;
  private readonly ctx: EvalContext;
  private readonly print: Print;
  private readonly ollama: OllamaClient;
  private readonly embeddingModel: string;
  private readonly deadline: number;
  private readonly tune: Record<string, Array<EvalCase>>;
  private readonly holdout: Record<string, Array<EvalCase>>;
  private data: SweepData;
  private currentModel: string | null = null;

  constructor(
    options: SweepOptions,
    ctx: EvalContext,
    data: SweepData,
    cases: { tune: Record<string, Array<EvalCase>>; holdout: Record<string, Array<EvalCase>> },
    print: Print,
  ) {
    const config = getConfig();
    this.options = options;
    this.ctx = ctx;
    this.data = data;
    this.tune = cases.tune;
    this.holdout = cases.holdout;
    this.print = print;
    this.ollama = new OllamaClient(config.ollama.host);
    this.embeddingModel = config.embeddings.model;
    this.deadline = Date.now() + options.budgetMinutes * 60_000;
  }

  async run(): Promise<void> {
    const { runId } = this.options;
    await appendRow(runId, {
      type: 'run',
      runId,
      at: new Date().toISOString(),
      env: await captureEnv(),
      argv: this.options.argv,
      numCtx: NUM_CTX,
    });
    try {
      if (this.options.holdout) await this.runHoldout();
      else if (this.options.short) await this.runShort();
      else await this.runFull();
      this.log('Finished.');
    } catch (error) {
      if (error instanceof OutOfTimeError) {
        this.log('Time budget reached. Run the same command again to carry on.');
      } else if (error instanceof LowBatteryError) {
        this.log(`Stopped: ${error.message} Let it charge, then run the same command again to carry on.`);
      } else {
        throw error;
      }
    } finally {
      this.data = await loadSweep(runId);
      await appendRow(runId, {
        type: 'run_end',
        at: new Date().toISOString(),
        calls: this.data.results.length,
        swapUsedMb: swapUsedMb(),
      });
    }
  }

  private log(line: string): void {
    this.print(`${new Date().toISOString().slice(11, 19)} ${line}`);
  }

  private casesFor(step: StepId, split: 'tune' | 'holdout'): Array<EvalCase> {
    return (split === 'tune' ? this.tune : this.holdout)[step] ?? [];
  }

  // Opened once. The starting configuration and the chosen one, side by side.
  private async runHoldout(): Promise<void> {
    const chosen = await loadStepsConfig();
    for (const size of this.options.sizes) {
      for (const step of this.options.steps) {
        const pair: Array<Planned> = [
          { step, settings: startSettings(step), block: 'start' },
          { step, settings: chosen.steps[step], block: 'chosen' },
        ];
        for (const planned of pair) {
          if (sizeOf(planned.settings.model) !== size) continue;
          await this.runConfig({
            ...planned,
            stage: 'holdout',
            cases: this.casesFor(step, 'holdout'),
            trials: CONFIRM_TRIALS,
          });
        }
      }
    }
  }

  private async runShort(): Promise<void> {
    const planned = shortPlan(this.options.steps);
    for (const size of this.options.sizes) {
      if (size === 'medium') await this.sentinel('A');
      await this.screen(planned, size);
      if (size === 'medium') await this.sentinel('B');
    }
  }

  private async runFull(): Promise<void> {
    const { steps, sizes } = this.options;
    // Screen, block 1: size x thinking x forced format.
    for (const size of sizes) {
      if (size === 'medium') await this.sentinel('A');
      for (const step of steps) {
        const start = configId(step, startSettings(step));
        const planned = block1(step, size).map((settings) => ({
          step,
          settings,
          block: configId(step, settings) === start ? 'start' : 'block1',
        }));
        await this.screen(planned, size);
      }
    }
    // Screen, block 2 and the probes: one change at a time from each size's best.
    if (!this.options.skipBlock2) {
      const planned = steps.flatMap((step) => block2For(this.data, step, sizes));
      for (const size of sizes) {
        if (size === 'medium') await this.sentinel('B');
        for (const step of steps) {
          await this.screen(
            planned.filter((p) => p.step === step),
            size,
          );
        }
      }
    }
    // Confirm: two more runs of the best three per step, and of the start.
    if (!this.options.skipConfirm) {
      const planned = new Map(steps.map((step) => [step, finalists(this.data, step)]));
      for (const size of sizes) {
        if (size === 'medium') await this.sentinel('C');
        for (const step of steps) {
          for (const settings of planned.get(step) ?? []) {
            if (sizeOf(settings.model) !== size) continue;
            await this.runConfig({
              step,
              settings,
              block: 'confirm',
              stage: 'confirm',
              cases: this.casesFor(step, 'tune'),
              trials: CONFIRM_TRIALS - 1,
              firstTrial: 2,
            });
          }
        }
      }
    }
  }

  // One run per tuning case, for each planned configuration of this size.
  private async screen(planned: ReadonlyArray<Planned>, size: Size): Promise<void> {
    for (const p of planned) {
      if (sizeOf(p.settings.model) !== size) continue;
      await this.runConfig({ ...p, stage: 'screen', cases: this.casesFor(p.step, 'tune'), trials: 1 });
    }
  }

  // A fixed ten-call reference, repeated through the night. If its time drifts,
  // the machine changed under the sweep and that night's timings are flagged.
  private async sentinel(label: string): Promise<void> {
    const stage = `sentinel-${label}`;
    const settings = startSettings('selector');
    const cases = (await STEP_EVALS.selector.cases(this.ctx)).filter((c) => c.split === 'tune').slice(0, 10);
    const cfg = configId('selector', settings);
    if (cases.every((c) => this.data.done.has(rowKey(stage, cfg, c.id, 1)))) return;
    await this.runConfig({ step: 'selector', settings, block: 'start', stage, cases, trials: 1 });
  }

  // One language model in memory at a time. Load time is recorded and kept out
  // of every timing.
  private async useModel(model: string): Promise<void> {
    if (this.currentModel === model) return;
    for (const loaded of await this.ollama.loadedModels()) {
      if (loaded.name === model || loaded.name.startsWith(this.embeddingModel)) continue;
      await this.ollama.unload(loaded.name);
    }
    const started = performance.now();
    // Three calls that are not timed: the first loads the model.
    const selector = STEP_EVALS.selector;
    const warm = (await selector.cases(this.ctx)).slice(0, WARM_UP_CALLS);
    for (const c of warm) {
      await selector.run(c, { ...startSettings('selector'), model, seed: 1 }, this.ctx);
    }
    const loaded = (await this.ollama.loadedModels()).find((m) => m.name === model);
    await appendRow(this.options.runId, {
      type: 'model_loaded',
      at: new Date().toISOString(),
      model,
      info: await modelInfo(model),
      loadAndWarmUpMs: Math.round(performance.now() - started),
      onGpu: onGpu(loaded) ?? 'unknown',
      swapUsedMb: swapUsedMb(),
    });
    this.log(
      `model ${model} loaded (${loaded ? `${onGpu(loaded) ?? 'unknown share'} on GPU` : 'not listed'}), swap ${swapUsedMb()} MB`,
    );
    this.currentModel = model;
  }

  // Far too slow to be usable: stop, and record it as stopped. Either every one
  // of the first three calls took more than twice the ceiling, or the median of
  // the first five did.
  private static farTooSlow(step: StepId, soFar: ReadonlyArray<ResultRow>): boolean {
    const timed = soFar.filter((r) => r.calls > 0).map((r) => r.ms);
    const limit = 2 * CEILING_MS[step];
    return (
      (timed.length === 3 && Math.min(...timed) > limit) || (timed.length === 5 && (upperMedian(timed) ?? 0) > limit)
    );
  }

  private async runConfig(o: ConfigRun): Promise<void> {
    const { runId } = this.options;
    const data = this.data;
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
    if (Date.now() > this.deadline) throw new OutOfTimeError();
    const battery = batteryState();
    if (battery.percent !== null && battery.percent < this.options.minBatteryPercent) {
      throw new LowBatteryError(battery.percent, this.options.minBatteryPercent);
    }

    await this.useModel(o.settings.model);
    const evalDef = STEP_EVALS[o.step];
    // One call that is not timed, so the first measured call is not the one
    // that pays for switching prompt or thinking mode.
    const firstCase = o.cases[0];
    if (firstCase) await evalDef.run(firstCase, { ...o.settings, seed: 1 }, this.ctx).catch(() => undefined);

    const started = Date.now();
    const { rows, stopped } = await runCases({
      evalDef,
      cases: o.cases,
      settings: o.settings,
      trials: o.trials,
      firstTrial: first,
      ctx: this.ctx,
      runId,
      stage: o.stage,
      done: data.done,
      shouldStop: (soFar) => o.stage === 'screen' && SweepRun.farTooSlow(o.step, soFar),
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
    this.log(
      `${o.step} [${o.stage}] ${describe(o.settings)}: ${s.casesAllPass}/${s.cases} cases, costly ${s.costly}, fallback ${s.fallbacks}, ` +
        `unusable ${s.truncated + s.schemaInvalid}, median ${s.medianMs} ms${stopped ? ' — STOPPED (too slow)' : ''} (${Math.round((Date.now() - started) / 1000)} s; battery ${batteryState().percent}%)`,
    );
  }
}

// Runs the existing checks across many configurations of each AI step, one
// model call at a time, writing every call to evals/results/<run id>.jsonl.
export async function runSweep(options: SweepOptions, print: Print): Promise<void> {
  // The held-back cases report on a choice; they do not make it.
  if (options.holdout && !existsSync(PATHS.decision)) {
    throw new EvalRefusedError(
      `The held-back cases stay closed until ${PATHS.decision} exists. They report on a choice; they do not make it.`,
    );
  }

  const ctx = await loadContext();
  const tune: Record<string, Array<EvalCase>> = {};
  const holdout: Record<string, Array<EvalCase>> = {};
  for (const step of options.steps) {
    const all: Array<EvalCase> = await STEP_EVALS[step].cases(ctx);
    tune[step] = all.filter((c) => c.split === 'tune');
    holdout[step] = all.filter((c) => c.split === 'holdout');
  }
  const data = await loadSweep(options.runId);

  if (options.plan) {
    printPlan(
      {
        runId: options.runId,
        steps: options.steps,
        sizes: options.sizes,
        tune,
        holdout,
        preflight: await readPreflight(),
        recordedCalls: data.results.length,
      },
      print,
    );
    return;
  }
  await new SweepRun(options, ctx, data, { tune, holdout }, print).run();
}
