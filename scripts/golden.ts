// Checks that the app still sends the model exactly what it sent before, and
// still makes exactly the same of every reply a model has given it. Runs
// offline: the network is replaced by a recorder.
//
//   pnpm golden                    compare with tests/golden/golden.json
//   pnpm golden --update           rewrite that file (only for a change that is meant)
//   pnpm golden --capture-vectors  also ask Ollama for any query vector not yet pinned
//   pnpm golden --dump out.json    write every replayed outcome, for comparing two versions
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { configureCommandLineLogging } from '@/common/logging/logger.server';
import { getConfig } from '@/config/env.server';
import { loadContext } from '@/eval/eval-context';
import { buildGolden, goldenDifferences } from '@/eval/golden/golden';
import type { Golden } from '@/eval/golden/golden';
import { loadSweep } from '@/eval/sweep/sweep-data';

configureCommandLineLogging();

const GOLDEN_FILE = 'tests/golden/golden.json';
const VECTORS_FILE = 'tests/golden/query-vectors.json';

const { values: args } = parseArgs({
  options: {
    update: { type: 'boolean', default: false },
    'capture-vectors': { type: 'boolean', default: false },
    dump: { type: 'string' },
    'run-id': { type: 'string', default: 'sweep-ollama' },
  },
});

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const vectors = new Map(Object.entries(await readJson<Record<string, Array<number>>>(VECTORS_FILE, {})));
const pinnedBefore = vectors.size;
const realFetch = globalThis.fetch;
const round = (v: Array<number>) => v.map((x) => Math.round(x * 1e5) / 1e5);

const ctx = await loadContext();
const data = await loadSweep(args['run-id'] ?? 'sweep-ollama');
const { golden, details, missingVectors } = await buildGolden(
  ctx,
  data.results,
  vectors,
  args['capture-vectors']
    ? async (texts, body) => {
        const res = await realFetch(`${getConfig().ollama.host}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...(body as object), input: texts }),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { embeddings?: Array<Array<number>> };
        return json.embeddings?.map(round) ?? null;
      }
    : undefined,
);

if (missingVectors.length) {
  console.error(
    `No pinned query vector for ${missingVectors.length} text(s). Run once with --capture-vectors while Ollama is running.`,
  );
  process.exit(1);
}
if (vectors.size !== pinnedBefore) {
  await writeFile(
    VECTORS_FILE,
    `${JSON.stringify(Object.fromEntries([...vectors].sort(([a], [b]) => a.localeCompare(b))))}\n`,
  );
  console.log(`Pinned ${vectors.size - pinnedBefore} query vector(s) in ${VECTORS_FILE}.`);
}
if (args.dump) await writeFile(args.dump, `${JSON.stringify(details, null, 1)}\n`);

const requestCount = Object.values(golden.requests)
  .flatMap((v) => Object.values(v).flatMap((s) => Object.values(s).map((c) => Object.keys(c).length)))
  .reduce((a, b) => a + b, 0);
const replayCount = Object.values(golden.replays).reduce((n, r) => n + r.rows, 0);
console.log(
  `${requestCount} request sets recorded; ${replayCount} saved replies replayed (${golden.skipped.infraErrors} skipped as never reaching a model, ${golden.skipped.unknownCases} for cases no longer in the files).`,
);

if (args.update) {
  await writeFile(GOLDEN_FILE, `${JSON.stringify(golden, null, 1)}\n`);
  console.log(`Wrote ${GOLDEN_FILE}.`);
} else {
  const expected = await readJson<Golden | null>(GOLDEN_FILE, null);
  if (!expected) {
    console.error(`${GOLDEN_FILE} does not exist yet. Run with --update on code that is known to be right.`);
    process.exit(1);
  }
  const differences = goldenDifferences(expected, golden);
  if (differences.length) {
    console.error(`${differences.length} difference(s) from ${GOLDEN_FILE}:`);
    for (const d of differences.slice(0, 40)) console.error(`  ${d}`);
    if (differences.length > 40) console.error(`  ... and ${differences.length - 40} more`);
    process.exit(1);
  }
  console.log('Identical to the recorded behaviour.');
}
