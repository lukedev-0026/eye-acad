import { execFileSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** Poppler XML (page, position, font size per line). Requires `pdftohtml`. */
export function extractPdfXml(pdf: string): string {
  return execFileSync('pdftohtml', ['-xml', '-i', '-stdout', pdf], {
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}
