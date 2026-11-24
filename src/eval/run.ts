import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CallOutcome, StepId, StepSettings } from '../server/llm/types';
import type { AnyStepEval, EvalCase, EvalContext, Graded, Split } from './types';

// A short, stable name for one configuration of one step. Two runs with the
// same settings get the same id, which is what makes a run resumable.
export function configId(step: StepId, s: StepSettings): string {
  const key = JSON.stringify([
    step,
    s.provider,
    s.model,
    s.thinking,
    s.forceFormat,
    s.promptVariant,
    s.temperature ?? null,
    s.sampling ?? null,
    s.effort ?? null,
    s.numCtx ?? null,
    s.maxOutputTokens,
    // Left out when empty so that ids recorded before this field existed stay valid.
    ...(s.improvements?.length ? [[...s.improvements].sort()] : []),
  ]);
  return createHash('sha1').update(key).digest('hex').slice(0, 10);
}

export type ResultRow = {
  type: 'result';
  runId: string;
  stage: string;
  at: string;
  step: StepId;
  configId: string;
  settings: StepSettings;
  split: Split;
  caseId: string;
  caseType: string;
  trial: number;
  seed: number | null;
  outcome: CallOutcome;
  pass: boolean;
  costly: boolean;
  fallback: boolean;
  detail: string;
  secondary?: Graded['secondary'];
  ms: number;
  modelMs: number;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingChars: number;
  model: string;
  observed: unknown;
  raw: string;
};

export function resultsFile(runId: string): string {
  return path.resolve(process.cwd(), 'evals/results', `${runId}.jsonl`);
}

export async function appendRow(runId: string, row: Record<string, unknown>): Promise<void> {
  const file = resultsFile(runId);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(row)}\n`);
}

export async function readRows(file: string): Promise<Array<Record<string, unknown>>> {
  try {
    return (await readFile(file, 'utf8'))
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

export const rowKey = (stage: string, cfg: string, caseId: string, trial: number) =>
  `${stage}|${cfg}|${caseId}|${trial}`;

// A small seeded shuffle, so the order is the same on a re-run but the same
// prompt never follows itself (Ollama skips work on a repeated prompt).
function shuffled<T>(items: Array<T>, seed: string): Array<T> {
  let state = Number.parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16);
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class TooManyInfraErrors extends Error {}

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
        graded = { pass: false, costly: false, fallback: false, detail: `exception: ${String(e)}` };
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
      if (infraStreak >= 5) throw new TooManyInfraErrors('Five calls in a row could not reach the model.');
      if (o.shouldStop?.(rows)) return { rows, stopped: true };
    }
  }
  return { rows, stopped: false };
}

// How one configuration did on one set of cases. n is the number of CASES and
// k the number that passed on every run: twenty cases run three times is 20,
// never 60.
export type Summary = {
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
};

const median = (values: Array<number>): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function summarise(rows: Array<ResultRow>): Summary {
  // A call that never reached the model says nothing about the configuration.
  const counted = rows.filter((r) => r.outcome !== 'infra_error');
  const byCase = new Map<string, Array<ResultRow>>();
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

// Before any model runs: do the graders agree with their own expected
// answers, and what does a step that ignores its input score?
export function selfTest(evalDef: AnyStepEval, cases: Array<EvalCase>, ctx: EvalContext) {
  const wrong: Array<string> = [];
  let constantPass = 0;
  for (const c of cases) {
    const ideal = evalDef.grade(c, evalDef.ideal(c, ctx), ctx);
    if (!ideal.pass || ideal.costly) wrong.push(`${c.id}: ${ideal.detail}`);
    if (evalDef.grade(c, evalDef.constant.observe(c, ctx), ctx).pass) constantPass++;
  }
  return {
    cases: cases.length,
    idealPass: cases.length - wrong.length,
    wrong,
    constantName: evalDef.constant.name,
    constantPass,
  };
}
