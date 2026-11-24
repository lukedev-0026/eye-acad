// Before anything is measured: prove the graders agree with their own
// expected answers, record the state of the machine, and check on each model
// that every setting the sweep varies actually takes effect.
//   pnpm sweep:preflight [--models small,medium,large]
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { describeJsonShape } from '@/application/prompts/json-shape.prompt';
import { getConfig } from '@/config/env.server';
import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import { loadContext } from '@/eval/eval-context';
import { selfTest } from '@/eval/run/run-cases';
import { captureEnv, modelInfo } from '@/eval/run-env';
import { STEP_EVALS } from '@/eval/steps/registry';
import { NUM_CTX, SIZES, settingsFor } from '@/eval/sweep/grid';
import type { Size } from '@/eval/sweep/grid';
import { OllamaClient } from '@/infrastructure/llm/ollama-http';

const { values: args } = parseArgs({ options: { models: { type: 'string', default: 'small,medium,large' } } });
const sizes = (args.models ?? '').split(',').filter((s): s is Size => s in SIZES);

const report: Record<string, unknown> = { at: new Date().toISOString() };
const problems: Array<string> = [];
const say = (line: string) => console.log(line);

// 1. Graders, with no model.
say('1. Graders (no model involved)');
const ctx = await loadContext();
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
  say(
    `   ${step}: ${st.idealPass} of ${st.cases} expected answers pass their own grader. Floor: ${st.constantPass} of ${st.cases} (${st.constantName}).`,
  );
  if (st.wrong.length)
    problems.push(
      `${step}: ${st.wrong.length} expected answers fail their own grader: ${st.wrong.slice(0, 3).join(' | ')}`,
    );
}
report.graders = graders;

// 2. The machine.
const env = await captureEnv();
report.env = env;
say(
  `\n2. Machine: ${env.machine}, ${env.memoryGb} GB. Power mode: ${env.powerMode}. On mains: ${env.onMains}. Swap in use: ${env.swapUsedMb} MB. Ollama ${env.ollamaVersion}.`,
);
if (env.powerMode === 'low power')
  problems.push('The Mac is in Low Power Mode: every timing will be slower than normal.');
if ((env.swapUsedMb ?? 0) > 2000)
  problems.push(
    `Swap in use is ${env.swapUsedMb} MB: a large model may be pushed into swap. A restart is advised before the timed run.`,
  );

// 3. Each model.
const Canary = z.object({ animal: z.enum(['cat', 'dog']), legs: z.enum(['two', 'four']) });
const models: Record<string, unknown> = {};
const engines = new Set<string>();

const ollama = new OllamaClient(getConfig().ollama.host);

for (const size of sizes) {
  const model = SIZES[size];
  const info = await modelInfo(model);
  if (!info) {
    problems.push(`${model} is not installed (ollama pull ${model}).`);
    say(`\n3. ${model}: NOT INSTALLED`);
    continue;
  }
  say(`\n3. ${model} (${info.sizeGb} GB, engine ${info.engine}, ${info.quantisation}, digest ${info.digest})`);
  engines.add(info.engine);
  const shown = await ollama.show(model);
  const shipped = Object.fromEntries(
    (shown.parameters ?? '')
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k, Number(v)]),
  );
  say(`   shipped options: ${JSON.stringify(shipped)}; thinking ${JSON.stringify(shown.thinking)}`);
  const m: Record<string, unknown> = { info, shipped, thinking: shown.thinking };

  // Thinking on and off, and forced format with each.
  const canaryPrompt = {
    system: `Answer about the animal in the question. ${describeJsonShape(Canary)}`,
    user: 'A household pet that barks. Which animal is it and how many legs does it have?',
  };
  const canaries: Record<string, unknown> = {};
  for (const thinking of [false, true]) {
    for (const forceFormat of [true, false]) {
      const s = { ...settingsFor('verifier', { size, thinking, forceFormat }), seed: 1 };
      const r = await ctx.models.callStep(s, canaryPrompt, Canary);
      const key = `thinking ${thinking ? 'on' : 'off'}, format ${forceFormat ? 'forced' : 'not forced'}`;
      canaries[key] = {
        outcome: r.outcome,
        thinkingChars: r.thinkingChars,
        value: r.value ?? null,
        ms: r.ms,
        outputTokens: r.server.outputTokens,
      };
      say(
        `   ${key}: ${r.outcome}, thinking text ${r.thinkingChars} chars, ${r.ms} ms, ${JSON.stringify(r.value ?? r.rawText.slice(0, 80))}`,
      );
      if (thinking && r.thinkingChars === 0)
        problems.push(`${model}: thinking was requested but no thinking text came back (${key}).`);
      if (!thinking && r.thinkingChars > 0)
        problems.push(`${model}: thinking was switched off but thinking text came back (${key}).`);
      if (forceFormat && r.outcome !== 'ok')
        problems.push(`${model}: forced format did not produce a valid reply (${key}: ${r.outcome}).`);
    }
  }
  m.canaries = canaries;

  // Does forced format hold an enum? Ask for something off the list and see
  // whether the reply stays on it.
  const OnList = z.object({ colour: z.enum(['red', 'green', 'blue']) });
  const enumChecks: Array<string> = [];
  for (const thinking of [false, true]) {
    const r = await ctx.models.callStep(
      { ...settingsFor('verifier', { size, thinking, forceFormat: true }), seed: 1 },
      {
        system: `Reply in JSON. ${describeJsonShape(OnList)}`,
        user: 'What colour is a ripe banana? Answer with the true colour.',
      },
      OnList,
    );
    // ok: the reply stayed on the list. schema_invalid: an off-list value got
    // through. truncated: it ran out of room before answering, which proves
    // nothing either way.
    enumChecks.push(r.outcome);
    say(
      `   forced enum, thinking ${thinking ? 'on' : 'off'}: ${r.outcome} ${JSON.stringify(r.value ?? r.rawText.slice(0, 60))}`,
    );
  }
  m.forcedEnum = enumChecks;
  if (enumChecks.includes('schema_invalid')) problems.push(`${model}: forced format let an off-list value through.`);

  // Longest real prompt of each step, against the context size.
  const fit: Record<string, unknown> = {};
  for (const step of STEP_IDS) {
    const evalDef = STEP_EVALS[step];
    const cases = (await evalDef.cases(ctx)).filter((c) => c.split === 'tune');
    if (!cases.length) continue;
    const longest = [...cases].sort((a, b) => JSON.stringify(b.input).length - JSON.stringify(a.input).length)[0];
    const s = { ...settingsFor(step, { size, thinking: false, forceFormat: true }), seed: 1 };
    const run = await evalDef.run(longest, s, ctx);
    const room =
      NUM_CTX - run.promptTokens - settingsFor(step, { size, thinking: true, forceFormat: true }).maxOutputTokens;
    fit[step] = { case: longest.id, promptTokens: run.promptTokens, roomLeftWithThinking: room };
    say(`   ${step}: longest prompt ${run.promptTokens} tokens; room left with thinking on: ${room}`);
    if (run.calls > 0 && room < 0)
      problems.push(`${model}/${step}: the longest prompt plus the output cap does not fit in ${NUM_CTX} tokens.`);
  }
  m.contextFit = fit;

  // Is temperature 0 with a fixed seed repeatable?
  const selector = STEP_EVALS.selector;
  const ten = (await selector.cases(ctx)).filter((c) => c.split === 'tune').slice(0, 10);
  let identical = 0;
  for (const c of ten) {
    const s = { ...settingsFor('selector', { size, thinking: false, forceFormat: true, temperature: 0 }), seed: 1 };
    const raws = [] as Array<string>;
    for (let i = 0; i < 3; i++) raws.push((await selector.run(c, s, ctx)).raw);
    if (raws.every((r) => r === raws[0])) identical++;
  }
  m.temperatureZeroRepeats = `${identical} of ${ten.length} requests gave the identical reply three times`;
  say(`   temperature 0, fixed seed: ${identical} of ${ten.length} requests gave the identical reply three times`);

  // Timing probe.
  const timing: Record<string, number> = {};
  for (const thinking of [false, true]) {
    const s = { ...settingsFor('selector', { size, thinking, forceFormat: true }), seed: 1 };
    const ms: Array<number> = [];
    for (const c of ten.slice(0, 5)) ms.push((await selector.run(c, s, ctx)).ms);
    ms.sort((a, b) => a - b);
    timing[thinking ? 'thinkingOn' : 'thinkingOff'] = ms[2];
  }
  m.selectorMedianMs = timing;
  say(`   selector call, median of 5: ${timing.thinkingOff} ms without thinking, ${timing.thinkingOn} ms with`);
  models[model] = m;
}
report.models = models;
if (engines.size > 1)
  problems.push(
    `The models do not all run on the same engine (${[...engines].join(', ')}), so the size comparison would be muddied.`,
  );
report.engine = [...engines].join(', ');
report.problems = problems;

await writeFile('evals/sweep/preflight.json', `${JSON.stringify(report, null, 2)}\n`);
say(`\n${problems.length ? `PROBLEMS (${problems.length}):\n- ${problems.join('\n- ')}` : 'No problems found.'}`);
say('\nWrote evals/sweep/preflight.json');
