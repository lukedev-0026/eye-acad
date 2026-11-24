import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidSettingsFileError } from '@/config/config.error';
import { resetConfig } from '@/config/env.server';
import { CaseFileError } from '@/domain/case/case.error';
import { NoteIndexMissingError, NoteIndexStaleError } from '@/domain/note/note.error';
import { loadCase, loadCitationGuidance, loadExaminerNotes } from '@/infrastructure/files/case-file.loader';
import { loadNoteIndex } from '@/infrastructure/files/note-index.loader';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';

const CASE_FILE = 'data/case-EA-VIVA-001.json';

let dir: string;

// Points the config at other files for one test.
function useEnv(variables: Record<string, string>): void {
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
  resetConfig();
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'viva-loaders-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetConfig();
  await rm(dir, { recursive: true, force: true });
});

describe('the case file', () => {
  it('loads the public part with no examiner notes in it', async () => {
    const publicCase = await loadCase();
    const text = JSON.stringify(publicCase);

    expect(publicCase.caseId).toBe('EA-VIVA-001');
    expect(publicCase.findings).toHaveLength(24);
    expect(publicCase.fileHash).toMatch(/^[0-9a-f]{16}$/);
    expect(text).not.toContain('examiner_notes');
    expect(text).not.toContain((await loadExaminerNotes()).diagnosis);
  });

  it('gives the examiner notes and the citation guidance only when asked for them', async () => {
    const notes = await loadExaminerNotes();

    expect(notes.key_points).toHaveLength(6);
    expect(notes.follow_up_ideas).toHaveLength(3);
    expect(await loadCitationGuidance()).toEqual(expect.any(String));
  });

  it('is read afresh each time, so an edit takes effect without a restart', async () => {
    const copy = path.join(dir, 'case.json');
    const original = JSON.parse(await readFile(CASE_FILE, 'utf8')) as { title: string };
    await writeFile(copy, JSON.stringify(original));
    const before = await loadCase(copy);

    await writeFile(copy, JSON.stringify({ ...original, title: 'Edited during the walkthrough' }));
    const after = await loadCase(copy);

    expect(after.title).toBe('Edited during the walkthrough');
    expect(after.fileHash).not.toBe(before.fileHash);
  });

  it('follows VIVA_CASE_FILE', async () => {
    const copy = path.join(dir, 'case.json');
    const original = JSON.parse(await readFile(CASE_FILE, 'utf8')) as object;
    await writeFile(copy, JSON.stringify({ ...original, title: 'Another case' }));
    useEnv({ VIVA_CASE_FILE: copy });

    expect((await loadCase()).title).toBe('Another case');
  });

  it('says so when the file is missing, keeping what the system reported as the cause', async () => {
    const missing = path.join(dir, 'nope.json');

    await expect(loadCase(missing)).rejects.toThrow(CaseFileError);
    await expect(loadCase(missing)).rejects.toMatchObject({
      code: 'CASE_FILE_INVALID',
      message: `Case file not found: ${missing}`,
      cause: { code: 'ENOENT' },
    });
  });

  it('says so when the file is not JSON', async () => {
    const broken = path.join(dir, 'broken.json');
    await writeFile(broken, '{ "case_id": ');

    await expect(loadCase(broken)).rejects.toThrow(/Case file is not valid JSON/);
  });

  it('names what is wrong when the file has the wrong shape', async () => {
    const wrong = path.join(dir, 'wrong.json');
    await writeFile(wrong, JSON.stringify({ case_id: 'X', findings: 'not a list' }));

    await expect(loadCase(wrong)).rejects.toThrow(/does not have the expected shape[\s\S]*findings/);
  });
});

describe('the settings file', () => {
  it('loads the settings for all five steps', async () => {
    const config = await loadStepsConfig('config/steps.start.json');

    expect(Object.keys(config.steps).sort()).toEqual(['coverage', 'followup', 'revision', 'selector', 'verifier']);
    expect(config.steps.selector).toMatchObject({ provider: 'ollama', thinking: false, forceFormat: true });
  });

  it('follows VIVA_STEPS_FILE when no file is named', async () => {
    useEnv({ VIVA_STEPS_FILE: 'config/steps.small.json' });

    expect((await loadStepsConfig()).steps.selector.model).toBe('qwen3.5:4b');
  });

  it('says which file is missing or is not JSON', async () => {
    const broken = path.join(dir, 'steps.json');
    await writeFile(broken, 'not json');

    await expect(loadStepsConfig(path.join(dir, 'absent.json'))).rejects.toThrow(InvalidSettingsFileError);
    await expect(loadStepsConfig(broken)).rejects.toMatchObject({
      code: 'SETTINGS_FILE_INVALID',
      details: { file: broken },
    });
  });

  it('names the setting that is wrong', async () => {
    const wrong = path.join(dir, 'steps.json');
    const good = JSON.parse(await readFile('config/steps.start.json', 'utf8')) as {
      steps: Record<string, Record<string, unknown>>;
    };
    good.steps.selector = { ...good.steps.selector, provider: 'somewhere-else' };
    await writeFile(wrong, JSON.stringify(good));

    await expect(loadStepsConfig(wrong)).rejects.toThrow(/is not a valid settings file[\s\S]*provider/);
  });
});

describe('the prepared reference note', () => {
  it('loads, with every passage carrying its pages', async () => {
    const index = await loadNoteIndex();

    expect(index.chunks).toHaveLength(126);
    expect(index.chunks.every((chunk) => chunk.pages.length > 0)).toBe(true);
  });

  it('refuses to be used when the PDF has changed since it was prepared', async () => {
    const changed = path.join(dir, 'note.pdf');
    await copyFile('data/reference-note.pdf', changed);
    await writeFile(changed, Buffer.concat([await readFile(changed), Buffer.from('\n% edited')]));
    useEnv({ VIVA_NOTE_PDF: changed });

    await expect(loadNoteIndex()).rejects.toThrow(NoteIndexStaleError);
    await expect(loadNoteIndex()).rejects.toMatchObject({
      code: 'NOTE_INDEX_STALE',
      expose: true,
      message: 'The reference note PDF has changed since it was prepared. Run: pnpm ingest',
    });
  });

  it('refuses to be used when it was prepared with a different embeddings model', async () => {
    useEnv({ VIVA_EMBEDDING_MODEL: 'some-other-model' });

    await expect(loadNoteIndex()).rejects.toThrow(/was prepared with nomic-embed-text but the app is set to/);
  });

  it('says it has not been prepared when there is no index', async () => {
    useEnv({ VIVA_NOTE_INDEX: path.join(dir, 'absent.json') });

    await expect(loadNoteIndex()).rejects.toThrow(NoteIndexMissingError);
    await expect(loadNoteIndex()).rejects.toMatchObject({ code: 'NOTE_INDEX_MISSING', status: 503 });
  });
});
