// Searches the files a browser downloads (the built app's client folder) for
// anything from the case file, and for names that exist only in server code.
// Run after a build; `pnpm verify` does both.
//   pnpm leak-scan
import { readFile } from 'node:fs/promises';

import { caseMarkers, findLeaks, readBuiltFiles, serverOnlyMarkers } from '@/eval/checks/leak-scan';
import { runCli } from '@/eval/cli';
import { EvalRefusedError } from '@/eval/eval.error';
import { PATHS } from '@/eval/paths';
import { caseFilePath } from '@/infrastructure/files/case-file.loader';

await runCli(async () => {
  const caseJson: unknown = JSON.parse(await readFile(caseFilePath(), 'utf8'));
  const markers = [...caseMarkers(caseJson), ...serverOnlyMarkers()];
  const files = await readBuiltFiles(PATHS.builtClient);
  const leaks = findLeaks(files, markers);
  for (const leak of leaks) console.log(`LEAK  ${leak.file}: "${leak.marker.text.slice(0, 60)}" (${leak.marker.from})`);
  if (leaks.length > 0) {
    throw new EvalRefusedError(`${leaks.length} thing(s) the browser must not be sent are in ${PATHS.builtClient}.`);
  }
  console.log(
    `Nothing from the case file and no server-only code in ${PATHS.builtClient}: ` +
      `${files.length} files searched for ${markers.length} pieces of text.`,
  );
});
