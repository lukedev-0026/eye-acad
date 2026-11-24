import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { CaseFileSchema } from '@/domain/case/case.schema';
import type { ExaminerNotes, PublicCase } from '@/domain/case/case.schema';

// The case file is read from disk on every request, never imported, so an edit
// made during the walkthrough takes effect on the next question and the file
// can never be bundled into browser code.
export function caseFilePath(): string {
  return path.resolve(process.cwd(), process.env.VIVA_CASE_FILE ?? 'data/case-EA-VIVA-001.json');
}

export class CaseFileError extends Error {}

async function readCaseFile() {
  const file = caseFilePath();
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new CaseFileError(`Case file not found: ${file}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new CaseFileError(`Case file is not valid JSON: ${String(e)}`);
  }
  const parsed = CaseFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new CaseFileError(`Case file does not have the expected shape:\n${z.prettifyError(parsed.error)}`);
  }
  const fileHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return { data: parsed.data, fileHash };
}

// Used while the trainee is asking for findings. No examiner notes.
export async function loadCase(): Promise<PublicCase> {
  const { data, fileHash } = await readCaseFile();
  return {
    caseId: data.case_id,
    title: data.title,
    openingPrompt: data.opening_prompt,
    patient: data.patient,
    findings: data.findings,
    fileHash,
  };
}

// Used only after the trainee has pressed "Give my answer".
export async function loadExaminerNotes(): Promise<ExaminerNotes> {
  const { data } = await readCaseFile();
  return data.examiner_notes;
}

// The case author's note on which part of the reference note to cite from.
export async function loadCitationGuidance(): Promise<string | null> {
  const { data } = await readCaseFile();
  return data.reference_source?.note ?? null;
}
