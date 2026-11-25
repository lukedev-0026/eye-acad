import { z } from 'zod';

const EyeSchema = z.enum(['right', 'left', 'both']).nullable();
export type Eye = z.infer<typeof EyeSchema>;

const FindingSchema = z.looseObject({
  id: z.string().min(1),
  eye: EyeSchema.default(null),
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]).nullable().default(null),
  unit: z.string().nullable().default(null),
  method: z.string().nullable().default(null),
  available: z.boolean(),
  unavailable_reason: z.string().nullable().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

const PatientValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
]);
export type PatientValue = z.infer<typeof PatientValue>;

const ExaminerNotesSchema = z.looseObject({
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
    reference_source: z.looseObject({ note: z.string().optional() }).optional(),
  })
  .refine(
    (c) => new Set(c.findings.map((f) => f.id)).size === c.findings.length,
    {
      error: 'Two findings share the same id.',
    },
  );

export type CaseFile = z.infer<typeof CaseFileSchema>;

export interface PublicCase {
  caseId: string;
  title: string;
  openingPrompt: string;
  patient: Record<string, PatientValue | null>;
  findings: Array<Finding>;
  fileHash: string;
}
