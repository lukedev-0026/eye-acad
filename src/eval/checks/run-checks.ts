import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import { errorMessage } from '@/common/errors/to-error';
import type { StepId } from '@/domain/llm/step-settings.schema';
import type { Print, Progress } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { EvalRefusedError } from '@/eval/eval.error';
import type { EvalCase, EvalContext } from '@/eval/eval.types';
import { PATHS, resultsFile } from '@/eval/paths';
import { checksMarkdown } from '@/eval/report/checks.report';
import type { ResultRow } from '@/eval/run/result-row';
import { appendRow, readRows } from '@/eval/run/results.store';
import { runCases } from '@/eval/run/run-cases';
import { selfTest } from '@/eval/run/self-test';
import { summarise } from '@/eval/run/summarise';
import { captureEnv, modelInfo } from '@/eval/run-env';
import { STEP_EVALS } from '@/eval/steps/registry';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';

import { runChain } from './chain.check';
import { runRequiredChecks } from './required.check';

export interface CheckOptions {
  // The settings file to run on. The app's own when not given.
  readonly configFile: string;
  // Which steps' case sets to run.
  readonly steps: ReadonlyArray<StepId>;
  // Whether to run the brief's three required checks, and which of them.
  readonly required: boolean;
  readonly requiredNames: ReadonlyArray<string> | null;
  // Whether to run the revision step and the support check together.
  readonly chain: boolean;
  readonly trials: number;
  readonly split: 'tune' | 'holdout' | 'all';
  // Regenerate CHECKS.md from this run's rows.
  readonly report: boolean;
}

const mark = (row: { pass: boolean; costly?: boolean }): string => (row.pass ? '.' : row.costly ? 'C' : 'x');

// Runs every AI-backed check through the app's real code on the configured
// settings, writes one row per model call, and regenerates CHECKS.md from
// those rows alone.
export async function runChecks(options: CheckOptions, print: Print, progress: Progress): Promise<void> {
  // The held-back cases exist to report on a choice, not to make it.
  if (options.split !== 'tune' && !existsSync(PATHS.decision)) {
    throw new EvalRefusedError(
      'The held-back cases are not opened until the settings have been chosen and written down\n' +
        `(${PATHS.decision}). They exist to report on a choice, not to make it.`,
    );
  }

  const config = await loadStepsConfig(options.configFile);
  const ctx = await loadContext();
  const env = await captureEnv();
  const runId = `check-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  const modelNames = [...new Set(Object.values(config.steps).map((s) => s.model))];
  await appendRow(runId, {
    type: 'run',
    runId,
    at: new Date().toISOString(),
    env,
    split: options.split,
    trials: options.trials,
    configFile: options.configFile,
    steps: config.steps,
    models: Object.fromEntries(await Promise.all(modelNames.map(async (m) => [m, await modelInfo(m)] as const))),
  });
  print(`Run ${runId}. Power mode: ${env.powerMode}. Swap in use: ${env.swapUsedMb} MB.`);

  if (options.required) {
    print('\nRequired checks');
    const rows = await runRequiredChecks(
      ctx,
      config,
      runId,
      options.requiredNames ? [...options.requiredNames] : null,
      async (row) => {
        await appendRow(runId, row);
        progress(row.pass ? '.' : 'x');
      },
    );
    print('');
    const names = [...new Set(rows.map((r) => `${r.check}|${r.name}`))];
    for (const name of names) {
      const mine = rows.filter((r) => `${r.check}|${r.name}` === name);
      print(`  check ${name.replace('|', ' ')}: ${mine.filter((r) => r.pass).length} of ${mine.length}`);
    }
  }

  for (const step of options.steps) {
    await runStepCases(step, ctx, { runId, options, settings: config.steps[step] }, print, progress);
  }

  // The revision step and the support check together, as the app runs them.
  if (options.chain && options.split !== 'all') {
    print('\nrevision step and support check together');
    const rows = await runChain(ctx, config, {
      runId,
      stage: 'check',
      split: options.split,
      trials: options.trials,
      label: 'configured',
      onRow: (row) => progress(mark(row)),
    });
    const s = summarise(rows);
    print(
      `\n  ${s.casesAllPass} of ${s.cases} cases passed every run (${s.casesFlipped} flipped). Costly errors: ${s.costly}.`,
    );
  }

  if (options.report) {
    await writeFile(PATHS.checksMarkdown, `${checksMarkdown(await readRows(resultsFile(runId)))}\n`);
    print(`\nWrote ${PATHS.checksMarkdown} from ${resultsFile(runId)}`);
  }
}

async function runStepCases(
  step: StepId,
  ctx: EvalContext,
  run: { runId: string; options: CheckOptions; settings: ResultRow['settings'] },
  print: Print,
  progress: Progress,
): Promise<void> {
  const evalDef = STEP_EVALS[step];
  const { split, trials } = run.options;
  let cases: Array<EvalCase>;
  try {
    cases = ((await evalDef.cases(ctx)) as Array<EvalCase>).filter((c) => split === 'all' || c.split === split);
  } catch (error) {
    print(`\n${step}: no case set yet (${errorMessage(error).slice(0, 80)})`);
    return;
  }
  const st = selfTest(evalDef, cases, ctx);
  await appendRow(run.runId, { type: 'selftest', step, ...st });
  print(
    `\n${step}: ${cases.length} ${split} cases. Graders agree with their own expected answers for ${st.idealPass} of ${st.cases}. Floor (${st.constantName}): ${st.constantPass} of ${st.cases}.`,
  );
  if (st.wrong.length) print(`  GRADER PROBLEMS: ${st.wrong.slice(0, 5).join(' | ')}`);

  const { rows } = await runCases({
    evalDef,
    cases,
    settings: run.settings,
    // At temperature 0 the same input gives the same output, so repeats add nothing.
    trials: run.settings.temperature === 0 ? 1 : trials,
    ctx,
    runId: run.runId,
    stage: 'check',
    onRow: (row) => progress(mark(row)),
  });
  const s = summarise(rows);
  print(
    `\n  ${s.casesAllPass} of ${s.cases} cases passed every run (${s.casesFlipped} flipped). Costly errors: ${s.costly}. Fallbacks: ${s.fallbacks}. ` +
      `Unusable replies: ${s.truncated + s.schemaInvalid + s.refusals}. Median ${s.medianMs} ms (${s.minMs}–${s.maxMs}).`,
  );
}
