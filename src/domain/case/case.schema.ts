import { z } from 'zod';

// Shape of the supplied case file. Unknown extra fields are allowed, so a
// reviewer can add to the file without breaking the loader.

export const EyeSchema = z.enum(['right', 'left', 'both']).nullable();
export type Eye = z.infer<typeof EyeSchema>;

export const FindingSchema = z.looseObject({
  id: z.string().min(1),
  eye: EyeSchema.default(null),
  label: z.string().min(1),
  // Pressures are JSON numbers; everything else is text.
  value: z.union([z.string(), z.number()]).nullable().default(null),
  unit: z.string().nullable().default(null),
  method: z.string().nullable().default(null),
  available: z.boolean(),
  unavailable_reason: z.string().nullable().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

const PatientValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]);
export type PatientValue = z.infer<typeof PatientValue>;

export const ExaminerNotesSchema = z.looseObject({
  diagnosis: z.string().min(1),
  key_points: z.array(z.string().min(1)),
  follow_up_ideas: z.array(z.string().min(1)).default([]),
});
export type ExaminerNotes = z.infer<typeof ExaminerNotesSchema>;

export const CaseFileSchema = z
  .looseObject({
    case_id: z.string().min(1),
    title: z.string().default(''),
    opening_prompt: z.string().min(1),
    patient: z.record(z.string(), PatientValue.nullable()),
    findings: z.array(FindingSchema).min(1),
    examiner_notes: ExaminerNotesSchema,
    // The case author's own instruction on how to cite the reference note.
    reference_source: z.looseObject({ note: z.string().optional() }).optional(),
  })
  .refine((c) => new Set(c.findings.map((f) => f.id)).size === c.findings.length, {
    message: 'Two findings share the same id.',
  });

// What the questioning phase is allowed to hold: everything except the notes.
export type CaseFile = z.infer<typeof CaseFileSchema>;

export type PublicCase = {
  caseId: string;
  title: string;
  openingPrompt: string;
  patient: Record<string, PatientValue | null>;
  findings: Array<Finding>;
  // Changes whenever the file's bytes change. Stored with each attempt.
  fileHash: string;
};
