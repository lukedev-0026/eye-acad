// Prints every finding and history item exactly as the app will show and say
// it, straight from the current case file. Compare against the case PDF.
//   pnpm findings
import type { RenderedItem } from '@/domain/examiner/render';
import { renderFinding, renderHistory } from '@/domain/examiner/render';
import { runCli } from '@/eval/cli';
import { loadCase } from '@/infrastructure/files/case-file.loader';

function print(item: RenderedItem): void {
  console.log(`  [${item.id}]`);
  console.log(`    shown : ${item.display}`);
  console.log(`    spoken: ${item.speech}`);
}

await runCli(async () => {
  const c = await loadCase();
  console.log(`Case ${c.caseId} (file hash ${c.fileHash})\n`);
  console.log('FINDINGS');
  for (const row of c.findings) print(renderFinding(row));
  console.log('\nHISTORY');
  for (const [key, value] of Object.entries(c.patient)) print(renderHistory(key, value));
});
