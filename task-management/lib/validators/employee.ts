import { z } from "zod";

/**
 * Normalize a name string before validation/storage:
 *  - rewrite literal backslash-escape sequences (\n / \t / \r) that snuck
 *    in from shell-mangled CLI args into a single space,
 *  - collapse any run of whitespace (including real newlines/tabs) into
 *    one space,
 *  - trim ends.
 *
 * Prevents data like "hetesh      \n  vichare" from ever reaching the
 * employees table again. Does NOT title-case — names like "van der Berg"
 * or "McConnell" need user judgment, not automation.
 */
export function normalizeName(raw: string): string {
  return raw
    .replace(/\\[ntr]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const nameField = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, "Name is required").max(120));

export const InviteEmployeeSchema = z.object({
  name:        nameField,
  email:       z.string().trim().toLowerCase().email("Invalid email"),
  role:        z.enum(["doer", "initiator", "both"]),
  department:  z.string().trim().max(60).optional().nullable(),
  isAdmin:     z.boolean().default(false),
});

export type InviteEmployeeInput = z.infer<typeof InviteEmployeeSchema>;

export const EmployeeIdSchema = z.string().uuid("Invalid employee id");

/**
 * Patch-shaped schema for `editEmployee`. Every field is optional and only
 * supplied keys are written. `email` and `firebase_uid` are intentionally
 * absent — those are immutable identity. Reject empty patches so callers
 * don't burn a round-trip on a no-op.
 */
export const EditEmployeeSchema = z
  .object({
    name:       z
      .string()
      .transform(normalizeName)
      .pipe(z.string().min(1, "Name is required").max(80))
      .optional(),
    role:       z.enum(["doer", "initiator", "both"]).optional(),
    department: z.string().trim().max(80).optional().nullable(),
    isAdmin:    z.boolean().optional(),
    // M4 — multi-channel admin controls.  `whatsappPhone` must be valid
    // E.164 (or empty/null to clear); the other three are simple booleans.
    whatsappPhone: z
      .union([
        z
          .string()
          .trim()
          .regex(
            /^\+[1-9]\d{1,14}$/,
            "WhatsApp phone must be E.164 (e.g. +919820062511)",
          ),
        z.literal(""),
        z.null(),
      ])
      .optional(),
    whatsappOptedIn: z.boolean().optional(),
    emailOptIn:      z.boolean().optional(),
    slackOptIn:      z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: "No changes to save." },
  );

export type EditEmployeeInput = z.infer<typeof EditEmployeeSchema>;
