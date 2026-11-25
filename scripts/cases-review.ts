// pnpm cases:review  write evals/cases/REVIEW.md with expected answers
import { writeFile } from 'node:fs/promises';

import { runCli } from '@/eval/cli';
import { loadContext } from '@/eval/eval-context';
import { PATHS } from '@/eval/paths';
import { casesReviewLines } from '@/eval/report/cases-review';

await runCli(async () => {
  const lines = await casesReviewLines(await loadContext());
  await writeFile(PATHS.casesReview, `${lines.join('\n')}\n`);
  console.log(`Wrote ${PATHS.casesReview} (${lines.length} lines)`);
});
