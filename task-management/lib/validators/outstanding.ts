import { z } from "zod";
import { OUTSTANDING_CYCLES, GST_RATES } from "@/db/enums";

// Pure (DB-free) zod schemas for the v2 Outstanding Tracker write actions.
// Kept here — not in the "use server" action file — so they can be unit
// tested without pulling in the DB/env/server-only chain.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CreateContractSchema = z
  .object({
    clientName: z.string().trim().min(1, "Client is required").max(200),
    contactPhone: z.string().trim().max(40).optional(),
    productId: z.string().uuid().optional(),
    entityId: z.string().uuid().optional(),
    responsibleId: z.string().uuid().optional(),
    expectedModeId: z.string().uuid().optional(),
    cycle: z.enum(OUTSTANDING_CYCLES),
    baseAmount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
    gstRate: z
      .number()
      .refine((v) => (GST_RATES as readonly number[]).includes(v), "Invalid GST rate"),
    startDate: z.string().regex(DATE_RE, "Invalid start date"),
    periods: z.number().int().min(1).max(600).nullable().optional(),
    endDate: z.string().regex(DATE_RE, "Invalid end date").nullable().optional(),
    pdcReceived: z.boolean(),
    comments: z.string().trim().max(1000).optional(),
  })
  .strict();
export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = z
  .object({
    clientName: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().trim().max(40).nullable().optional(),
    productId: z.string().uuid().nullable().optional(),
    entityId: z.string().uuid().nullable().optional(),
    responsibleId: z.string().uuid().nullable().optional(),
    expectedModeId: z.string().uuid().nullable().optional(),
    cycle: z.enum(OUTSTANDING_CYCLES).optional(),
    baseAmount: z.number().positive().max(1_000_000_000).optional(),
    gstRate: z
      .number()
      .refine((v) => (GST_RATES as readonly number[]).includes(v), "Invalid GST rate")
      .optional(),
    startDate: z.string().regex(DATE_RE, "Invalid start date").optional(),
    periods: z.number().int().min(1).max(600).nullable().optional(),
    endDate: z.string().regex(DATE_RE, "Invalid end date").nullable().optional(),
    pdcReceived: z.boolean().optional(),
    comments: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;

export const EditInstallmentSchema = z
  .object({
    dueDate: z.string().regex(DATE_RE, "Invalid date").optional(),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

export const AdhocInstallmentSchema = z
  .object({
    dueDate: z.string().regex(DATE_RE, "Invalid date"),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
  })
  .strict();

export const CreateCollectionSchema = z
  .object({
    clientName: z.string().trim().min(1, "Client is required").max(200),
    contractId: z.string().uuid().nullable().optional(),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
    paymentModeId: z.string().uuid(),
    responsibleId: z.string().uuid(),
    collectedAt: z.string().regex(DATE_RE, "Invalid date").optional(),
    comments: z.string().trim().max(1000).optional(),
  })
  .strict();
export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;
