import { z } from "zod";

/** Training Centre — validation for slice 1 (material library + lookups). */

export const TC_LOOKUP_KINDS = ["subject", "service"] as const;
export type TcLookupKind = (typeof TC_LOOKUP_KINDS)[number];

const optionalUuid = z
  .string()
  .uuid("Pick a valid option.")
  .optional()
  .nullable()
  .transform((v) => v ?? null);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const uuidArray = z.array(z.string().uuid()).default([]);

export const CreateMaterialSchema = z.object({
  subjectId: optionalUuid,
  los: optionalText(200),
  filePath: optionalText(500),
  fileName: optionalText(255),
  fileType: z
    .enum(["video", "pdf", "xls"])
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  videoUrl: optionalText(1000),
  notes: optionalText(5000),
  version: optionalText(50),
  versionNotes: optionalText(2000),
  createdByIds: uuidArray,
  assistedByIds: uuidArray,
  partOfInduction: z.boolean().default(false),
  inductionDeptIds: uuidArray,
});
export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;

export const UpdateMaterialSchema = CreateMaterialSchema.extend({
  id: z.string().uuid(),
});

export const AddTcLookupSchema = z.object({
  kind: z.enum(TC_LOOKUP_KINDS),
  name: z.string().trim().min(1, "Enter a value.").max(120, "Keep it under 120 characters."),
});

export const DeleteTcLookupSchema = z.object({
  kind: z.enum(TC_LOOKUP_KINDS),
  id: z.string().uuid(),
});
