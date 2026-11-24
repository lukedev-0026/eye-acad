import { readFile, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { sha1Hex } from '@/common/hash.server';
import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';
import type { Print } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { EvalRefusedError } from '@/eval/eval.error';
import { PATHS, caseFile, resultsFile } from '@/eval/paths';
import { resultsCsv } from '@/eval/report/results-csv';
import { sweepMarkdown } from '@/eval/report/sweep.report';
import { configId } from '@/eval/run/config-id';
import { summarise } from '@/eval/run/summarise';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';

import { applyRule } from './apply-rule';
import type { RuleOutcome } from './apply-rule';
import { tieBand } from './choosing-rule';
import { CEILING_MS, describe } from './grid';
import { loadSweep, regrade } from './sweep-data';
import type { SweepData } from './sweep-data';
import { PreflightSchema } from './sweep-rows.schema';
import type { Preflight } from './sweep-rows.schema';

export interface ReportOptions {
  readonly runId: string;
  // Also write the chosen settings: config/steps.chosen.json as the rule made
  // them, and config/steps.json for the app.
  readonly apply: boolean;
}

const SHOWN_PER_STEP = 6;
const DRIFT_LIMIT_PERCENT = 20;

async function readPreflight(): Promise<Preflight> {
  try {
    return PreflightSchema.parse(JSON.parse(await readFile(PATHS.preflight, 'utf8')));
  } catch {
    // No pre-check was saved: the column it feeds is left blank.
    return {};
  }
}

// A short hash of a file, or nothing if it is not there.
async function shortHash(file: string): Promise<string> {
  try {
    return sha1Hex(await readFile(file)).slice(0, 10);
  } catch {
    return '';
  }
}

// A fingerprint of the prompts as the model receives them, for each step and
// wording. It comes from the golden file, which a check (`pnpm golden`) holds
// equal to what the code sends. Hashing the prompt's source file would change
// whenever that file was reformatted or moved, with the prompt unchanged.
const GoldenFingerprintsSchema = z.looseObject({
  promptFingerprints: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

async function readPromptFingerprints(): Promise<Record<string, Record<string, string>>> {
  try {
    const golden = GoldenFingerprintsSchema.parse(JSON.parse(await readFile(PATHS.golden, 'utf8')));
    return golden.promptFingerprints ?? {};
  } catch {
    return {};
  }
}

// The same ten calls are repeated through a run. If their time moves by more
// than a fifth, that run's timings are flagged.
function timingDrift(data: SweepData): string | null {
  const sentinels = [...new Set(data.results.filter((r) => r.stage.startsWith('sentinel')).map((r) => r.stage))].sort();
  if (!sentinels.length) return null;
  const medians = sentinels.map((stage) => summarise(data.results.filter((r) => r.stage === stage)).medianMs ?? 0);
  const drift = Math.round(((Math.max(...medians) - Math.min(...medians)) / Math.min(...medians)) * 100);
  const readings = sentinels.map((s, i) => `${s.replace('sentinel-', '')} ${medians[i]} ms`).join(', ');
  return `the same ten calls, repeated through the run: ${readings}. Drift ${drift}%${drift > DRIFT_LIMIT_PERCENT ? ' — over 20%, so timings are flagged' : ''}.`;
}

function printRanking(rule: RuleOutcome, print: Print): void {
  for (const step of rule.stepsWithData) {
    const list = rule.ranked[step] ?? [];
    const confirmed = list.some((c) => c.summary.trialsPerCase >= 3);
    print(
      `${step}  (ceiling ${CEILING_MS[step]} ms; tied within ${tieBand(Math.max(...list.map((c) => c.summary.cases)))} case; ${confirmed ? 'confirmation runs' : 'SCREENING RUN ONLY — not yet confirmed'})`,
    );
    for (const c of list.slice(0, SHOWN_PER_STEP)) {
      const mark = rule.chosen[step]?.configId === c.configId ? '=> ' : '   ';
      print(
        `${mark}${String(c.summary.casesAllPass).padStart(2)}/${c.summary.cases} cases, flipped ${c.summary.casesFlipped}, costly ${c.summary.costly}, fallback ${c.summary.fallbacks}, ` +
          `${String(c.summary.medianMs).padStart(6)} ms  tier ${c.tier === 1000 ? '-' : c.tier}  ${describe(c.settings)}  [${c.why}]`,
      );
    }
    if (list[0] && !list[0].eligible) {
      print('   NOTE: no configuration is eligible for this step; the fewest costly errors was used.');
    }
    if (rule.changed.includes(step)) print('   NOTE: moved off its first choice to keep the app to two models.');
    print('');
  }
}

// The settings the rule chose, in the form of the app's settings file. The
// seed is a property of one run, not of a configuration, so it is left out.
function chosenSettings(rule: RuleOutcome): Partial<Record<StepId, StepSettings>> {
  const steps: Partial<Record<StepId, StepSettings>> = {};
  for (const step of STEP_IDS) {
    const pick = rule.chosen[step];
    if (pick) steps[step] = { ...pick.settings, seed: undefined };
  }
  return steps;
}

// Turns the sweep's recorded calls into the results table and the write-up
// tables, applies the written rule, and says what it chose.
export async function reportSweep(options: ReportOptions, print: Print): Promise<void> {
  const data = await loadSweep(options.runId);
  if (!data.results.length) {
    throw new EvalRefusedError(`No results recorded under ${resultsFile(options.runId)} yet.`);
  }
  // Every stored reply is scored against the case files as they are now.
  const ctx = await loadContext();
  const regraded = await regrade(data, ctx);
  if (regraded.changed) {
    print(
      `Note: ${regraded.changed} stored verdicts differ from the ones recorded at run time, because an expected answer has been corrected since. Corrections are listed in evals/cases/CORRECTIONS.md.`,
    );
  }

  const rule = applyRule(data);
  const caseHashes: Partial<Record<StepId, string>> = {};
  for (const step of STEP_IDS) caseHashes[step] = await shortHash(caseFile(`${step}.jsonl`));
  const lines = resultsCsv(data, rule.chosen, {
    runId: options.runId,
    preflight: await readPreflight(),
    caseHashes,
    promptFingerprints: await readPromptFingerprints(),
  });
  await writeFile(PATHS.resultsCsv, `${lines.join('\n')}\n`);
  print(
    `Sweep ${options.runId}: ${data.results.length} calls, ${data.configs.size} configurations. Wrote ${PATHS.resultsCsv} (${lines.length - 1} rows).\n`,
  );

  const drift = timingDrift(data);
  if (drift) print(`Timing reference: ${drift}\n`);
  const confirmedSteps = rule.stepsWithData.filter((step) =>
    (rule.ranked[step] ?? []).some((c) => data.results.some((r) => r.configId === c.configId && r.stage === 'confirm')),
  );
  await writeFile(
    PATHS.resultsMarkdown,
    `${sweepMarkdown(data, rule.ranked, rule.chosen, { changed: rule.changed, drift, confirmedSteps, suppliedQuestions: ctx.notes.follow_up_ideas })}\n`,
  );

  printRanking(rule, print);
  if (!rule.complete) return;

  const models = [...new Set(STEP_IDS.map((step) => rule.chosen[step]?.settings.model))];
  print(`Chosen by the rule: ${models.length} model(s): ${models.join(', ')}`);
  let current: Record<StepId, StepSettings> | null = null;
  try {
    current = (await loadStepsConfig()).steps;
  } catch {
    // Nothing has been chosen yet.
  }
  // The sweep chooses settings. A named improvement is a change to a step's
  // logic switched on afterwards, on top of that choice, so it is set aside
  // for the comparison and reported beside it.
  const sweptOnly = ({ improvements: _improvements, ...settings }: StepSettings): StepSettings => settings;
  const same =
    current !== null &&
    STEP_IDS.every((step) => configId(step, sweptOnly(current[step])) === rule.chosen[step]?.configId);
  const switchedOn = current
    ? STEP_IDS.flatMap((step) => (current[step].improvements ?? []).map((name) => `${name} (${step})`))
    : [];
  print(
    same
      ? `${PATHS.stepsConfig} already holds exactly this` +
          (switchedOn.length ? `, with switched on afterwards: ${switchedOn.join(', ')}.` : '.')
      : `${PATHS.stepsConfig} does NOT hold this yet.`,
  );
  if (options.apply) {
    const chosen = chosenSettings(rule);
    await writeFile(PATHS.chosenConfig, `${JSON.stringify({ steps: chosen }, null, 2)}\n`);
    // An improvement already switched on in the app's settings stays on.
    const inForce: Partial<Record<StepId, StepSettings>> = {};
    for (const step of STEP_IDS) {
      const settings = chosen[step];
      if (!settings) continue;
      const improvements = current?.[step].improvements;
      inForce[step] = improvements?.length ? { ...settings, improvements } : settings;
    }
    await writeFile(PATHS.stepsConfig, `${JSON.stringify({ steps: inForce }, null, 2)}\n`);
    print(`Wrote ${PATHS.chosenConfig} and ${PATHS.stepsConfig}.`);
  }
}
