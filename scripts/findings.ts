// Prints every finding and history item exactly as the app will show and say
// it, straight from the current case file. Compare against the case PDF.
//   pnpm findings
import { renderFinding, renderHistory } from '@/domain/examiner/render';
import { loadCase } from '@/infrastructure/files/case-file.loader';

const c = await loadCase();
console.log(`Case ${c.caseId} (file hash ${c.fileHash})\n`);
console.log('FINDINGS');
for (const row of c.findings) {
  const r = renderFinding(row);
  console.log(`  [${r.id}]`);
  console.log(`    shown : ${r.display}`);
  console.log(`    spoken: ${r.speech}`);
}
console.log('\nHISTORY');
for (const [key, value] of Object.entries(c.patient)) {
  const r = renderHistory(key, value);
  console.log(`  [${r.id}]`);
  console.log(`    shown : ${r.display}`);
  console.log(`    spoken: ${r.speech}`);
}
