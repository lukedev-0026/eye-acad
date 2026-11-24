import { itemAt } from '@/common/arrays';
import { describeError } from '@/common/errors/to-error';
import { sha1Hex } from '@/common/hash.server';
import type { CallOutcome } from '@/domain/llm/call-result';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { TooManyInfraErrorsError } from '@/eval/eval.error';
import type { AnyStepEval, EvalCase, EvalContext, Graded } from '@/eval/eval.types';

import { configId } from './config-id';
import { rowKey } from './result-row';
import type { ResultRow } from './result-row';
import { appendRow } from './results.store';

// A small seeded shuffle, so the order is the same on a re-run but the same
// prompt never follows itself (Ollama skips work on a repeated prompt).
function shuffled<T>(items: Array<T>, seed: string): Array<T> {
  let state = Number.parseInt(sha1Hex(seed).slice(0, 8), 16);
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const swapped = itemAt(out, i);
    out[i] = itemAt(out, j);
    out[j] = swapped;
  }
  return out;
}

export type RunOptions = {
  evalDef: AnyStepEval;
  cases: Array<EvalCase>;
  settings: StepSettings;
  trials: number;
  // Seeds are 1, 2, 3... by trial, and recorded.
  firstTrial?: number;
  ctx: EvalContext;
  runId: string;
  stage: string;
  // Rows already on disk from an interrupted run.
  done?: Set<string>;
  // Return true to stop this configuration early (for example, far too slow).
  shouldStop?: (rows: Array<ResultRow>) => boolean;
  onRow?: (row: ResultRow) => void;
};

// Runs one configuration over a set of cases, one call at a time, writing a
// row per call as it goes.
export async function runCases(o: RunOptions): Promise<{ rows: Array<ResultRow>; stopped: boolean }> {
  const cfg = configId(o.evalDef.step, o.settings);
  const rows: Array<ResultRow> = [];
  let infraStreak = 0;
  const first = o.firstTrial ?? 1;
  for (let trial = first; trial < first + o.trials; trial++) {
    for (const c of shuffled(o.cases, `${cfg}:${trial}`)) {
      if (o.done?.has(rowKey(o.stage, cfg, c.id, trial))) continue;
      const seed = o.settings.provider === 'ollama' ? trial : null;
      const settings = seed === null ? o.settings : { ...o.settings, seed };
      const started = performance.now();
      let outcome: CallOutcome;
      let graded: Graded;
      let run: Awaited<ReturnType<AnyStepEval['run']>> | null = null;
      try {
        run = await o.evalDef.run(c, settings, o.ctx);
        outcome = run.outcome;
        graded = o.evalDef.grade(c, run.observed, o.ctx);
        // Truncation, a refusal or an unusable reply is a failed run, whatever
        // the fallback observation happened to look like.
        if (outcome !== 'ok') graded = { ...graded, pass: false, detail: `${outcome}; ${graded.detail}` };
      } catch (e) {
        outcome = 'infra_error';
        graded = { pass: false, costly: false, fallback: false, detail: `exception: ${describeError(e)}` };
      }
      infraStreak = outcome === 'infra_error' ? infraStreak + 1 : 0;
      const row: ResultRow = {
        type: 'result',
        runId: o.runId,
        stage: o.stage,
        at: new Date().toISOString(),
        step: o.evalDef.step,
        configId: cfg,
        settings,
        split: c.split,
        caseId: c.id,
        caseType: c.type,
        trial,
        seed,
        outcome,
        pass: graded.pass,
        costly: graded.costly,
        fallback: graded.fallback,
        detail: graded.detail,
        secondary: graded.secondary,
        ms: run?.ms ?? Math.round(performance.now() - started),
        modelMs: run?.modelMs ?? 0,
        calls: run?.calls ?? 0,
        promptTokens: run?.promptTokens ?? 0,
        outputTokens: run?.outputTokens ?? 0,
        thinkingChars: run?.thinkingChars ?? 0,
        model: run?.model ?? o.settings.model,
        observed: run?.observed ?? null,
        raw: (run?.raw ?? '').slice(0, 3000),
      };
      rows.push(row);
      await appendRow(o.runId, row);
      o.onRow?.(row);
      if (infraStreak >= 5) throw new TooManyInfraErrorsError();
      if (o.shouldStop?.(rows)) return { rows, stopped: true };
    }
  }
  return { rows, stopped: false };
}
