import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sha1Hex, sha256Hex, sha256OfFile } from '@/common/hash.server';
import { appendJsonl, readJsonl } from '@/common/jsonl.server';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'viva-jsonl-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('a JSON Lines file', () => {
  it('is empty before anything is written', async () => {
    expect(await readJsonl(path.join(dir, 'absent.jsonl'))).toEqual([]);
  });

  it('gains one line per row, in order, creating its folder if need be', async () => {
    const file = path.join(dir, 'results', 'run.jsonl');

    await appendJsonl(file, { n: 1, text: 'a\nb' });
    await appendJsonl(file, { n: 2 });

    expect(await readJsonl(file)).toEqual([{ n: 1, text: 'a\nb' }, { n: 2 }]);
    expect((await readFile(file, 'utf8')).split('\n')).toHaveLength(3);
  });
});

describe('hashing', () => {
  it('gives the standard digests', async () => {
    const file = path.join(dir, 'x.jsonl');
    await appendJsonl(file, 'abc');

    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256OfFile(file)).toBe(sha256Hex('"abc"\n'));
  });
});
