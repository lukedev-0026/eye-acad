import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// JSON Lines: one JSON value per line. Results are kept this way so that a
// run can add a row at a time and a stopped run loses nothing.

// Every row of a file, or none if the file does not exist yet.
export async function readJsonl(file: string): Promise<Array<unknown>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line): unknown => JSON.parse(line));
}

export async function appendJsonl(file: string, row: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(row)}\n`);
}
