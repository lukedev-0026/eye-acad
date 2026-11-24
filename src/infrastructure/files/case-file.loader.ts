import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { errorMessage } from '@/common/errors/to-error';
import { sha256Hex } from '@/common/hash.server';
import { getConfig } from '@/config/env.server';
import { CaseFileError } from '@/domain/case/case.error';
import { CaseFileSchema } from '@/domain/case/case.schema';
import type { CaseFile, ExaminerNotes, PublicCase } from '@/domain/case/case.schema';

// The case file is read from disk on every request, never imported, so an edit
// made during the walkthrough takes effect on the next question and the file
// can never be bundled into browser code.
export function caseFilePath(): string {
  return getConfig().files.caseFile;
}

async function readCaseFile(file: string): Promise<{ data: CaseFile; fileHash: string }> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new CaseFileError(`Case file not found: ${file}`, { cause: error, details: { file } });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CaseFileError(`Case file is not valid JSON: ${errorMessage(error)}`, { cause: error, details: { file } });
  }
  const parsed = CaseFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new CaseFileError(`Case file does not have the expected shape:\n${z.prettifyError(parsed.error)}`, {
      cause: parsed.error,
      details: { file },
    });
  }
  const fileHash = sha256Hex(text).slice(0, 16);
  return { data: parsed.data, fileHash };
}

// Used while the trainee is asking for findings. No examiner notes.
export async function loadCase(file: string = caseFilePath()): Promise<PublicCase> {
  const { data, fileHash } = await readCaseFile(file);
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
export async function loadExaminerNotes(file: string = caseFilePath()): Promise<ExaminerNotes> {
  const { data } = await readCaseFile(file);
  return data.examiner_notes;
}

// The case author's note on which part of the reference note to cite from.
export async function loadCitationGuidance(file: string = caseFilePath()): Promise<string | null> {
  const { data } = await readCaseFile(file);
  return data.reference_source?.note ?? null;
}
