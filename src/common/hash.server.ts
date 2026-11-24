import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

type Hashable = string | Uint8Array;

export function sha1Hex(data: Hashable): string {
  return createHash('sha1').update(data).digest('hex');
}

export function sha256Hex(data: Hashable): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function sha256OfFile(file: string): Promise<string> {
  return sha256Hex(await readFile(file));
}
