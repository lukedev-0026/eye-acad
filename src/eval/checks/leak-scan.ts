import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { EvalRefusedError } from '@/eval/eval.error';

export interface Marker {
  readonly text: string;
  readonly from: string;
}

export interface Leak {
  readonly file: string;
  readonly marker: Marker;
}

export interface BuiltFile {
  readonly file: string;
  readonly text: string;
}

const MIN_LENGTH = 12;

const SERVER_ONLY: ReadonlyArray<string> = [
  'examiner_notes',
  'firebase-admin',
  'verifyIdToken',
  'node:async_hooks',
  'pino',
  'api.deepgram.com',
  'DEEPGRAM_API_KEY',
  '127.0.0.1:11434',
  'Reply with one JSON object',
];

/** Every case-file string long enough to be unmistakable. */
export function caseMarkers(value: unknown, from = 'case file'): Array<Marker> {
  if (typeof value === 'string')
    return value.length >= MIN_LENGTH ? [{ text: value, from }] : [];
  if (Array.isArray(value))
    return value.flatMap((item, i) => caseMarkers(item, `${from}[${i}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      caseMarkers(item, `${from}.${key}`),
    );
  }
  return [];
}

export function serverOnlyMarkers(): Array<Marker> {
  return SERVER_ONLY.map((text) => ({ text, from: 'server-only code' }));
}

// Bundlers may escape quotes and unusual letters: match as written and as JSON.
function forms(text: string): Array<string> {
  const escaped = JSON.stringify(text).slice(1, -1);
  return escaped === text ? [text] : [text, escaped];
}

export function findLeaks(
  files: ReadonlyArray<BuiltFile>,
  markers: ReadonlyArray<Marker>,
): Array<Leak> {
  return files.flatMap(({ file, text }) =>
    markers
      .filter((marker) =>
        forms(marker.text).some((form) => text.includes(form)),
      )
      .map((marker) => ({ file, marker })),
  );
}

export async function readBuiltFiles(dir: string): Promise<Array<BuiltFile>> {
  let names: Array<string>;
  try {
    names = await readdir(dir, { recursive: true });
  } catch (error) {
    throw new EvalRefusedError(
      `There is no built app at ${dir}. Run: pnpm build`,
      { cause: error },
    );
  }
  const files: Array<BuiltFile> = [];
  for (const name of names.sort()) {
    const file = path.join(dir, name);
    try {
      files.push({ file, text: await readFile(file, 'utf8') });
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EISDIR'
      ))
        throw error;
    }
  }
  return files;
}
