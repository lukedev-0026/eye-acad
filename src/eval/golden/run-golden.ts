import { readFile, writeFile } from 'node:fs/promises';

import { getConfig } from '@/config/env.server';
import type { Print } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { EvalRefusedError } from '@/eval/eval.error';
import { PATHS } from '@/eval/paths';
import { loadSweep } from '@/eval/sweep/sweep-data';

import { buildGolden, goldenDifferences } from './golden';
import type { Golden } from './golden';

export interface GoldenOptions {
  // The saved results whose replies are replayed.
  readonly runId: string;
  // Rewrite the recorded behaviour. Only for a change that is meant.
  readonly update: boolean;
  // Ask Ollama for any query vector that is not pinned yet.
  readonly captureVectors: boolean;
  // Write every replayed outcome here, for comparing two versions of the code.
  readonly dump?: string | undefined;
}

const MAX_DIFFERENCES_SHOWN = 40;
const round = (vector: Array<number>): Array<number> => vector.map((x) => Math.round(x * 1e5) / 1e5);

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

// Asks the real embeddings model, bypassing the recorder. Used once, to pin a
// query vector that is not in the fixture yet.
function embedFromOllama(realFetch: typeof fetch) {
  return async (texts: Array<string>, body: unknown): Promise<Array<Array<number>> | null> => {
    const res = await realFetch(`${getConfig().ollama.host}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...(body as object), input: texts }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embeddings?: Array<Array<number>> };
    return json.embeddings?.map(round) ?? null;
  };
}

// Checks that the app still sends the model exactly what it sent before, and
// still makes exactly the same of every reply a model has given it.
export async function runGolden(options: GoldenOptions, print: Print): Promise<void> {
  const pinned = ((await readJson(PATHS.queryVectors)) ?? {}) as Record<string, Array<number>>;
  const vectors = new Map(Object.entries(pinned));
  const pinnedBefore = vectors.size;

  const ctx = await loadContext();
  const data = await loadSweep(options.runId);
  const { golden, details, missingVectors } = await buildGolden(
    ctx,
    data.results,
    vectors,
    options.captureVectors ? embedFromOllama(globalThis.fetch) : undefined,
  );

  if (missingVectors.length) {
    throw new EvalRefusedError(
      `No pinned query vector for ${missingVectors.length} text(s). Run once with --capture-vectors while Ollama is running.`,
    );
  }
  if (vectors.size !== pinnedBefore) {
    const sorted = Object.fromEntries([...vectors].sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(PATHS.queryVectors, `${JSON.stringify(sorted)}\n`);
    print(`Pinned ${vectors.size - pinnedBefore} query vector(s) in ${PATHS.queryVectors}.`);
  }
  if (options.dump) await writeFile(options.dump, `${JSON.stringify(details, null, 1)}\n`);

  const requestCount = Object.values(golden.requests)
    .flatMap((byVariant) => Object.values(byVariant).flatMap((byShape) => Object.values(byShape)))
    .reduce((n, byCase) => n + Object.keys(byCase).length, 0);
  const replayCount = Object.values(golden.replays).reduce((n, r) => n + r.rows, 0);
  print(
    `${requestCount} request sets recorded; ${replayCount} saved replies replayed (${golden.skipped.infraErrors} skipped as never reaching a model, ${golden.skipped.unknownCases} for cases no longer in the files).`,
  );

  if (options.update) {
    await writeFile(PATHS.golden, `${JSON.stringify(golden, null, 1)}\n`);
    print(`Wrote ${PATHS.golden}.`);
    return;
  }

  const expected = (await readJson(PATHS.golden)) as Golden | undefined;
  if (!expected) {
    throw new EvalRefusedError(
      `${PATHS.golden} does not exist yet. Run with --update on code that is known to be right.`,
    );
  }
  const differences = goldenDifferences(expected, golden);
  if (differences.length) {
    const shown = differences.slice(0, MAX_DIFFERENCES_SHOWN).map((d) => `  ${d}`);
    const more = differences.length - shown.length;
    throw new EvalRefusedError(
      [
        `${differences.length} difference(s) from ${PATHS.golden}:`,
        ...shown,
        ...(more > 0 ? [`  ... and ${more} more`] : []),
      ].join('\n'),
    );
  }
  print('Identical to the recorded behaviour.');
}
