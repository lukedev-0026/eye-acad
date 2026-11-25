import { writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { describeJsonShape } from '@/application/prompts/json-shape.prompt';
import { getConfig } from '@/config/env.server';
import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import type { Print } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import type { EvalCase, EvalContext } from '@/eval/eval.types';
import { PATHS } from '@/eval/paths';
import { selfTest } from '@/eval/run/self-test';
import { captureEnv, modelInfo } from '@/eval/run-env';
import type { RunEnv } from '@/eval/run-env';
import { STEP_EVALS } from '@/eval/steps/registry';
import { OllamaClient } from '@/infrastructure/llm/ollama-http';

import { NUM_CTX, SIZES, settingsFor } from './grid';
import type { Size } from './grid';

const SWAP_WARNING_MB = 2000;
const REPEATS = 3;
const TIMING_CALLS = 5;

interface Findings {
  readonly problems: Array<string>;
  readonly print: Print;
}

const tuneCases = async (
  step: (typeof STEP_IDS)[number],
  ctx: EvalContext,
): Promise<Array<EvalCase>> =>
  (await STEP_EVALS[step].cases(ctx)).filter((c) => c.split === 'tune');

async function checkGraders(
  ctx: EvalContext,
  { problems, print }: Findings,
): Promise<Record<string, unknown>> {
  print('1. Graders (no model involved)');
  const graders: Record<string, unknown> = {};
  for (const step of STEP_IDS) {
    const evalDef = STEP_EVALS[step];
    const cases = await evalDef.cases(ctx);
    const st = selfTest(evalDef, cases, ctx);
    graders[step] = {
      cases: st.cases,
      tune: cases.filter((c) => c.split === 'tune').length,
      holdout: cases.filter((c) => c.split === 'holdout').length,
      expectedAnswersPass: st.idealPass,
      floor: `${st.constantPass} of ${st.cases} (${st.constantName})`,
      wrong: st.wrong,
    };
    print(
      `   ${step}: ${st.idealPass} of ${st.cases} expected answers pass their own grader. Floor: ${st.constantPass} of ${st.cases} (${st.constantName}).`,
    );
    if (st.wrong.length) {
      problems.push(
        `${step}: ${st.wrong.length} expected answers fail their own grader: ${st.wrong.slice(0, 3).join(' | ')}`,
      );
    }
  }
  return graders;
}

function checkMachine(env: RunEnv, { problems, print }: Findings): void {
  print(
    `\n2. Machine: ${env.machine}, ${env.memoryGb} GB. Power mode: ${env.powerMode}. On mains: ${env.onMains}. Swap in use: ${env.swapUsedMb} MB. Ollama ${env.ollamaVersion}.`,
  );
  if (env.powerMode === 'low power') {
    problems.push(
      'The Mac is in Low Power Mode: every timing will be slower than normal.',
    );
  }
  if ((env.swapUsedMb ?? 0) > SWAP_WARNING_MB) {
    problems.push(
      `Swap in use is ${env.swapUsedMb} MB: a large model may be pushed into swap. A restart is advised before the timed run.`,
    );
  }
}

const Canary = z.object({
  animal: z.enum(['cat', 'dog']),
  legs: z.enum(['two', 'four']),
});
const OnList = z.object({ colour: z.enum(['red', 'green', 'blue']) });

async function checkSwitches(
  size: Size,
  ctx: EvalContext,
  { problems, print }: Findings,
): Promise<Record<string, unknown>> {
  const model = SIZES[size];
  const prompt = {
    system: `Answer about the animal in the question. ${describeJsonShape(Canary)}`,
    user: 'A household pet that barks. Which animal is it and how many legs does it have?',
  };
  const canaries: Record<string, unknown> = {};
  for (const thinking of [false, true]) {
    for (const forceFormat of [true, false]) {
      const settings = {
        ...settingsFor('verifier', { size, thinking, forceFormat }),
        seed: 1,
      };
      const r = await ctx.models.callStep(settings, prompt, Canary);
      const key = `thinking ${thinking ? 'on' : 'off'}, format ${forceFormat ? 'forced' : 'not forced'}`;
      canaries[key] = {
        outcome: r.outcome,
        thinkingChars: r.thinkingChars,
        value: r.value ?? null,
        ms: r.ms,
        outputTokens: r.server.outputTokens,
      };
      print(
        `   ${key}: ${r.outcome}, thinking text ${r.thinkingChars} chars, ${r.ms} ms, ${JSON.stringify(r.value ?? r.rawText.slice(0, 80))}`,
      );
      if (thinking && r.thinkingChars === 0) {
        problems.push(
          `${model}: thinking was requested but no thinking text came back (${key}).`,
        );
      }
      if (!thinking && r.thinkingChars > 0) {
        problems.push(
          `${model}: thinking was switched off but thinking text came back (${key}).`,
        );
      }
      if (forceFormat && r.outcome !== 'ok') {
        problems.push(
          `${model}: forced format did not produce a valid reply (${key}: ${r.outcome}).`,
        );
      }
    }
  }
  return canaries;
}

async function checkForcedEnum(
  size: Size,
  ctx: EvalContext,
  { problems, print }: Findings,
): Promise<Array<string>> {
  const outcomes: Array<string> = [];
  for (const thinking of [false, true]) {
    const r = await ctx.models.callStep(
      {
        ...settingsFor('verifier', { size, thinking, forceFormat: true }),
        seed: 1,
      },
      {
        system: `Reply in JSON. ${describeJsonShape(OnList)}`,
        user: 'What colour is a ripe banana? Answer with the true colour.',
      },
      OnList,
    );
    outcomes.push(r.outcome);
    print(
      `   forced enum, thinking ${thinking ? 'on' : 'off'}: ${r.outcome} ${JSON.stringify(r.value ?? r.rawText.slice(0, 60))}`,
    );
  }
  if (outcomes.includes('schema_invalid')) {
    problems.push(
      `${SIZES[size]}: forced format let an off-list value through.`,
    );
  }
  return outcomes;
}

async function checkContextFit(
  size: Size,
  ctx: EvalContext,
  { problems, print }: Findings,
): Promise<Record<string, unknown>> {
  const fit: Record<string, unknown> = {};
  for (const step of STEP_IDS) {
    const cases = await tuneCases(step, ctx);
    const longest = [...cases].sort(
      (a, b) => JSON.stringify(b.input).length - JSON.stringify(a.input).length,
    )[0];
    if (!longest) continue;
    const settings = {
      ...settingsFor(step, { size, thinking: false, forceFormat: true }),
      seed: 1,
    };
    const run = await STEP_EVALS[step].run(longest, settings, ctx);
    const room =
      NUM_CTX -
      run.promptTokens -
      settingsFor(step, { size, thinking: true, forceFormat: true })
        .maxOutputTokens;
    fit[step] = {
      case: longest.id,
      promptTokens: run.promptTokens,
      roomLeftWithThinking: room,
    };
    print(
      `   ${step}: longest prompt ${run.promptTokens} tokens; room left with thinking on: ${room}`,
    );
    if (run.calls > 0 && room < 0) {
      problems.push(
        `${SIZES[size]}/${step}: the longest prompt plus the output cap does not fit in ${NUM_CTX} tokens.`,
      );
    }
  }
  return fit;
}

async function checkRepeatsAndTiming(
  size: Size,
  ctx: EvalContext,
  { print }: Findings,
): Promise<Record<string, unknown>> {
  const selector = STEP_EVALS.selector;
  const ten = (await tuneCases('selector', ctx)).slice(0, 10);

  let identical = 0;
  for (const c of ten) {
    const settings = {
      ...settingsFor('selector', {
        size,
        thinking: false,
        forceFormat: true,
        temperature: 0,
      }),
      seed: 1,
    };
    const raws: Array<string> = [];
    for (let i = 0; i < REPEATS; i++)
      raws.push((await selector.run(c, settings, ctx)).raw);
    if (raws.every((raw) => raw === raws[0])) identical++;
  }
  const repeats = `${identical} of ${ten.length} requests gave the identical reply three times`;
  print(`   temperature 0, fixed seed: ${repeats}`);

  const timing: Record<string, number | undefined> = {};
  for (const thinking of [false, true]) {
    const settings = {
      ...settingsFor('selector', { size, thinking, forceFormat: true }),
      seed: 1,
    };
    const ms: Array<number> = [];
    for (const c of ten.slice(0, TIMING_CALLS))
      ms.push((await selector.run(c, settings, ctx)).ms);
    ms.sort((a, b) => a - b);
    timing[thinking ? 'thinkingOn' : 'thinkingOff'] = ms[2];
  }
  print(
    `   selector call, median of 5: ${timing.thinkingOff} ms without thinking, ${timing.thinkingOn} ms with`,
  );
  return { temperatureZeroRepeats: repeats, selectorMedianMs: timing };
}

async function checkModel(
  size: Size,
  ctx: EvalContext,
  ollama: OllamaClient,
  engines: Set<string>,
  findings: Findings,
): Promise<Record<string, unknown> | null> {
  const model = SIZES[size];
  const info = await modelInfo(model);
  if (!info) {
    findings.problems.push(`${model} is not installed (ollama pull ${model}).`);
    findings.print(`\n3. ${model}: NOT INSTALLED`);
    return null;
  }
  findings.print(
    `\n3. ${model} (${info.sizeGb} GB, engine ${info.engine}, ${info.quantisation}, digest ${info.digest})`,
  );
  engines.add(info.engine);

  const shown = await ollama.show(model);
  const shipped = Object.fromEntries(
    (shown.parameters ?? '')
      .split('\n')
      .flatMap((line): Array<[string, number]> => {
        const [name, value, ...rest] = line.trim().split(/\s+/);
        return name !== undefined && value !== undefined && rest.length === 0
          ? [[name, Number(value)]]
          : [];
      }),
  );
  findings.print(
    `   shipped options: ${JSON.stringify(shipped)}; thinking ${JSON.stringify(shown.thinking)}`,
  );

  return {
    info,
    shipped,
    thinking: shown.thinking,
    canaries: await checkSwitches(size, ctx, findings),
    forcedEnum: await checkForcedEnum(size, ctx, findings),
    contextFit: await checkContextFit(size, ctx, findings),
    ...(await checkRepeatsAndTiming(size, ctx, findings)),
  };
}

export async function runPreflight(
  options: { sizes: ReadonlyArray<Size> },
  print: Print,
): Promise<void> {
  const findings: Findings = { problems: [], print };
  const report: Record<string, unknown> = { at: new Date().toISOString() };

  const ctx = await loadContext();
  report.graders = await checkGraders(ctx, findings);

  const env = await captureEnv();
  report.env = env;
  checkMachine(env, findings);

  const ollama = new OllamaClient(getConfig().ollama.host);
  const engines = new Set<string>();
  const models: Record<string, unknown> = {};
  for (const size of options.sizes) {
    const checked = await checkModel(size, ctx, ollama, engines, findings);
    if (checked) models[SIZES[size]] = checked;
  }
  report.models = models;

  if (engines.size > 1) {
    findings.problems.push(
      `The models do not all run on the same engine (${[...engines].join(', ')}), so the size comparison would be muddied.`,
    );
  }
  report.engine = [...engines].join(', ');
  report.problems = findings.problems;

  await writeFile(PATHS.preflight, `${JSON.stringify(report, null, 2)}\n`);
  const { problems } = findings;
  print(
    `\n${problems.length ? `PROBLEMS (${problems.length}):\n- ${problems.join('\n- ')}` : 'No problems found.'}`,
  );
  print(`\nWrote ${PATHS.preflight}`);
}
