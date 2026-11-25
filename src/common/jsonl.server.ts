import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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
