import { z } from 'zod';

import { ChainRowSchema, ResultRowSchema } from '@/eval/run/result-row';
import type { ChainRow, ResultRow } from '@/eval/run/result-row';
import { parseRow, readRows } from '@/eval/run/results.store';
import { RunEnvSchema } from '@/eval/run-env';

import { RequiredRowSchema } from './required-row.schema';
import type { RequiredRow } from './required-row.schema';

// One run of `pnpm check`, read back from its results file. CHECKS.md is built
// from this and from nothing else.

// The first row: the machine and the settings the run was made on.
const CheckHeaderSchema = z.looseObject({
  type: z.literal('run'),
  runId: z.string(),
  at: z.string(),
  env: RunEnvSchema,
  configFile: z.string(),
  steps: z.record(
    z.string(),
    z.looseObject({
      model: z.string(),
      thinking: z.boolean(),
      forceFormat: z.boolean(),
      promptVariant: z.string(),
      temperature: z.number().optional(),
    }),
  ),
});
export type CheckHeader = z.infer<typeof CheckHeaderSchema>;

// What a step's grader made of its own expected answers, before any model ran.
const SelfTestRowSchema = z.object({
  type: z.literal('selftest'),
  step: z.string(),
  cases: z.number(),
  idealPass: z.number(),
  wrong: z.array(z.string()),
  constantName: z.string(),
  constantPass: z.number(),
});
export type SelfTestRow = z.infer<typeof SelfTestRowSchema>;

const CheckResultRowSchema = z.union([ResultRowSchema, ChainRowSchema]);

export interface CheckRun {
  readonly header: CheckHeader | null;
  readonly required: Array<RequiredRow>;
  // One row per model call: a step on its case set, or the revision chain.
  readonly results: Array<ResultRow | ChainRow>;
  readonly selfTests: Array<SelfTestRow>;
}

export async function readCheckRun(file: string): Promise<CheckRun> {
  const run: { header: CheckHeader | null } & Omit<CheckRun, 'header'> = {
    header: null,
    required: [],
    results: [],
    selfTests: [],
  };
  (await readRows(file)).forEach((row, i) => {
    const line = i + 1;
    switch (row.type) {
      case 'run':
        run.header ??= parseRow(CheckHeaderSchema, row, file, line);
        break;
      case 'required':
        run.required.push(parseRow(RequiredRowSchema, row, file, line));
        break;
      case 'result':
        run.results.push(parseRow(CheckResultRowSchema, row, file, line));
        break;
      case 'selftest':
        run.selfTests.push(parseRow(SelfTestRowSchema, row, file, line));
        break;
      default:
        break;
    }
  });
  return run;
}
