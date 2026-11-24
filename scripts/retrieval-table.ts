// Compares the three ways of searching the note and writes
// evals/retrieval-table.md. No language model is involved.
//   pnpm retrieval-table
import { writeFile } from 'node:fs/promises';

import { runCli } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { PATHS } from '@/eval/paths';
import { retrievalTableMarkdown } from '@/eval/report/retrieval-table';

await runCli(async () => {
  const table = await retrievalTableMarkdown(await loadContext());
  await writeFile(PATHS.retrievalTable, table);
  console.log(table);
});
