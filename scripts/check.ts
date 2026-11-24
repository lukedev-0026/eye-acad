// Runs every AI-backed check through the app's real code on the configured
// settings, writes one row per model call to evals/results/, and regenerates
// CHECKS.md from those rows.
//   pnpm check                      everything, on the tuning cases
//   pnpm check --only required      just the brief's three checks
//   pnpm check --steps selector     just one step's case set
//   pnpm check --config config/steps.start.json --trials 1
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { configureCommandLineLogging } from '@/common/logging/logger.server';
import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepId } from '@/domain/llm/step-settings.schema';
import { runChain } from '@/eval/checks/chain.check';
import { runRequiredChecks } from '@/eval/checks/required.check';
import { loadContext } from '@/eval/eval-context';
import { resultsFile } from '@/eval/paths';
import { checksMarkdown } from '@/eval/report/checks.report';
import { appendRow, readRows } from '@/eval/run/results.store';
import { runCases } from '@/eval/run/run-cases';
import { selfTest } from '@/eval/run/self-test';
import { summarise } from '@/eval/run/summarise';
import { captureEnv, modelInfo } from '@/eval/run-env';
import { STEP_EVALS } from '@/eval/steps/registry';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';

configureCommandLineLogging();

const { values: args } = parseArgs({
  options: {
    config: { type: 'string', default: 'config/steps.json' },
    steps: { type: 'string' },
    only: { type: 'string' },
    trials: { type: 'string', default: '3' },
    split: { type: 'string', default: 'tune' },
    required: { type: 'string' },
    'no-report': { type: 'boolean', default: false },
  },
});

const split = args.split as 'tune' | 'holdout' | 'all';
if (split !== 'tune' && !existsSync('evals/sweep/DECISION.md')) {
  console.error(
    'The held-back cases are not opened until the settings have been chosen and written down\n' +
      '(evals/sweep/DECISION.md). They exist to report on a choice, not to make it.',
  );
  process.exit(1);
}

const config = await loadStepsConfig(args.config);
const ctx = await loadContext();
const env = await captureEnv();
const runId = `check-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
const trials = Number(args.trials);
const steps = (args.only === 'required' ? [] : (args.steps?.split(',') ?? [...STEP_IDS])) as Array<StepId>;
const runRequired = args.only === 'required' || (!args.steps && args.only !== 'steps');

await appendRow(runId, {
  type: 'run',
  runId,
  at: new Date().toISOString(),
  env,
  split,
  trials,
  configFile: args.config,
  steps: config.steps,
  models: Object.fromEntries(
    await Promise.all(
      [...new Set(Object.values(config.steps).map((s) => s.model))].map(async (m) => [m, await modelInfo(m)]),
    ),
  ),
});
console.log(`Run ${runId}. Power mode: ${env.powerMode}. Swap in use: ${env.swapUsedMb} MB.`);

if (runRequired) {
  console.log('\nRequired checks');
  const rows = await runRequiredChecks(ctx, config, runId, args.required?.split(',') ?? null, async (row) => {
    await appendRow(runId, row);
    process.stdout.write(row.pass ? '.' : 'x');
  });
  console.log();
  const names = [...new Set(rows.map((r) => `${r.check}|${r.name}`))];
  for (const n of names) {
    const mine = rows.filter((r) => `${r.check}|${r.name}` === n);
    console.log(`  check ${n.replace('|', ' ')}: ${mine.filter((r) => r.pass).length} of ${mine.length}`);
  }
}

for (const step of steps) {
  const evalDef = STEP_EVALS[step];
  let cases;
  try {
    cases = (await evalDef.cases(ctx)).filter((c) => split === 'all' || c.split === split);
  } catch (e) {
    console.log(`\n${step}: no case set yet (${String(e).slice(0, 80)})`);
    continue;
  }
  const st = selfTest(evalDef, cases, ctx);
  await appendRow(runId, { type: 'selftest', step, ...st });
  console.log(
    `\n${step}: ${cases.length} ${split} cases. Graders agree with their own expected answers for ${st.idealPass} of ${st.cases}. Floor (${st.constantName}): ${st.constantPass} of ${st.cases}.`,
  );
  if (st.wrong.length) console.log(`  GRADER PROBLEMS: ${st.wrong.slice(0, 5).join(' | ')}`);
  const settings = config.steps[step];
  // At temperature 0 the same input gives the same output, so repeats add nothing.
  const n = settings.temperature === 0 ? 1 : trials;
  const { rows } = await runCases({
    evalDef,
    cases,
    settings,
    trials: n,
    ctx,
    runId,
    stage: 'check',
    onRow: (row) => process.stdout.write(row.pass ? '.' : row.costly ? 'C' : 'x'),
  });
  const s = summarise(rows);
  console.log(
    `\n  ${s.casesAllPass} of ${s.cases} cases passed every run (${s.casesFlipped} flipped). Costly errors: ${s.costly}. Fallbacks: ${s.fallbacks}. ` +
      `Unusable replies: ${s.truncated + s.schemaInvalid + s.refusals}. Median ${s.medianMs} ms (${s.minMs}–${s.maxMs}).`,
  );
}

// The revision step and the support check together, as the app runs them.
if (!args.steps && args.only !== 'required' && split !== 'all') {
  console.log('\nrevision step and support check together');
  const rows = await runChain(ctx, config, {
    runId,
    stage: 'check',
    split,
    trials,
    label: 'configured',
    onRow: (row) => process.stdout.write(row.pass ? '.' : row.costly ? 'C' : 'x'),
  });
  const s = summarise(rows);
  console.log(
    `\n  ${s.casesAllPass} of ${s.cases} cases passed every run (${s.casesFlipped} flipped). Costly errors: ${s.costly}.`,
  );
}

if (!args['no-report']) {
  await writeFile('CHECKS.md', `${checksMarkdown(await readRows(resultsFile(runId)))}\n`);
  console.log(`\nWrote CHECKS.md from evals/results/${runId}.jsonl`);
}
