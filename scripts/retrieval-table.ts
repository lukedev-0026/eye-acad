// pnpm retrieval-table  compare note search methods, write evals/
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
