import { execFileSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

// The PDF as poppler's XML: every line of text with its page, position and
// font size, which is what tells a heading from a table from a footer.
// Needs `pdftohtml` (poppler) to be installed.
export function extractPdfXml(pdf: string): string {
  // Arguments are passed as a list, never through a shell.
  return execFileSync('pdftohtml', ['-xml', '-i', '-stdout', pdf], { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
}
