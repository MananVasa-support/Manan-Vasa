import { z } from "zod";
import {
  BILLING_PROPOSAL_STATUSES,
  WMS_PROPOSAL_TYPES,
  isMilestoneStage,
  BILLING_PAYMENT_TYPES,
  BILLING_TDS_RATES_ACCEPTED,
  BILLING_PRODUCTS,
  ALLOCATION_PRODUCT_CODES,
  parseEmailList,
  invalidEmails,
  BILLING_SCHEDULE_PRODUCT_TYPES,
  ALLOCATION_SCOPES,
  BILL_RAISE_OPTIONS,
} from "@/db/enums";

/**
 * Pure (DB-free) zod schemas for the Client Address Book write actions. Kept out
 * of the "use server" file so they unit-test without pulling in the DB/env
 * chain — same split as lib/validators/outstanding.ts.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .nullish()
    .transform((v) => (v === "" || v === undefined ? null : v));

const emailStr = z.string().trim().toLowerCase().email("Invalid email address").max(254);

export const ClientEmailSchema = z.object({
  email: emailStr,
  label: optionalText(60),
  isPrimary: z.boolean().default(false),
});

/**
 * The rail's seven fields. `address` arrives as ONE string (that is how the rail
 * captures it) and is written to address_line1; the remaining address columns
 * stay available for a future structured editor without a migration.
 */
export const UpsertClientSchema = z.object({
  id: z.string().uuid().optional(),
  name: trimmed(160).min(1, "Client name is required"),
  company: optionalText(200),
  contactPerson: optionalText(160),
  phone: optionalText(30),
  address: optionalText(400),
  notes: optionalText(2000),
  emails: z
    .array(ClientEmailSchema)
    .max(10, "At most 10 email addresses")
    .default([])
    // Caught here so a duplicate returns a readable message instead of letting
    // the unique index throw a raw Postgres error into the action result.
    .superRefine((rows, ctx) => {
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.email)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate email: ${r.email}` });
        }
        seen.add(r.email);
      }
      if (rows.filter((r) => r.isPrimary).length > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only one email can be primary" });
      }
    }),
});
export type UpsertClientInput = z.infer<typeof UpsertClientSchema>;

// ── WMS Proposals ──────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Create/update a WMS proposal. `id` present ⇒ update.
 *
 * `code` (Proposal Number) is trimmed and required: it is the identifier quoted
 * to the client, and a blank or whitespace-only one is a filing error. The
 * database's UNIQUE index is what actually guarantees no duplicates — this only
 * catches the empty case early with a readable message.
 */
/**
 * A list of email addresses, however the caller sent it: an array, or the raw
 * comma-separated string the field holds. Every address is checked, so one typo
 * is named back rather than silently mailing nowhere.
 */
function emailList(label: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .default([])
    .transform((v) => parseEmailList(Array.isArray(v) ? v.join(",") : v))
    .refine((list) => list.length <= 25, { message: `Too many ${label} addresses (max 25)` })
    .superRefine((list, ctx) => {
      const bad = invalidEmails(list);
      if (bad.length) {
        ctx.addIssue({ code: "custom", message: `${label}: "${bad[0]}" is not a valid email address` });
      }
    });
}

export const UpsertWmsProposalSchema = z.object({
  id: z.string().uuid().optional(),
  code: trimmed(60).min(1, "Proposal number is required"),
  proposalDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  clientId: z.string().uuid("Select a client from the address book"),
  productType: z.enum(BILLING_PRODUCTS).default("wms"),
  /**
   * Company. Free text rather than an enum on purpose: a proposal saved under
   * the older Entity list must still open and save without being rewritten.
   */
  entity: trimmed(80).nullish().or(z.literal("").transform(() => null)),
  // Typed addresses, comma-separated in the UI, de-duplicated on the way in.
  toEmails: emailList("Email"),
  ccEmails: emailList("CC"),
  wmsType: z
    .enum(WMS_PROPOSAL_TYPES)
    .nullish()
    .or(z.literal("").transform(() => null)),
  status: z.enum(BILLING_PROPOSAL_STATUSES).default("draft"),
  notes: optionalText(2000),
  /** Storage descriptors written by the upload action, not by the browser. */
  attachments: z
    .array(
      z.object({
        path: trimmed(300).min(1),
        name: trimmed(200).min(1),
        mime: trimmed(120).default("application/octet-stream"),
        size: z.number().int().nonnegative().max(20 * 1024 * 1024),
      }),
    )
    .max(20)
    .default([]),
});
export type UpsertWmsProposalInput = z.infer<typeof UpsertWmsProposalSchema>;

// ── Proposal milestones ────────────────────────────────────────────────────

/**
 * Create/update one milestone. `id` present ⇒ update.
 *
 * `amount` is nullable on purpose: a milestone may be a pure delivery
 * checkpoint. Blank input becomes null rather than 0 so "no payment due" stays
 * distinguishable from "a payment of zero" in the totals.
 */
export const UpsertMilestoneSchema = z.object({
  id: z.string().uuid().optional(),
  proposalId: z.string().uuid(),
  // Open-ended: `advance` or `m<N>`. Validated by shape rather than a fixed
  // list so the sequence can grow without a schema change.
  stage: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isMilestoneStage, "Stage must be 'advance' or 'm<number>'"),
  title: optionalText(160),
  description: optionalText(1000),
  dueDate: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .nullish()
    .or(z.literal("").transform(() => null)),
  amount: z
    .number()
    .finite()
    .min(0, "Amount cannot be negative")
    .max(1_000_000_000, "Amount looks wrong — over ₹100 crore")
    .nullish(),
  isDelivered: z.boolean().default(false),
});
export type UpsertMilestoneInput = z.infer<typeof UpsertMilestoneSchema>;

// ── Payment Schedule ───────────────────────────────────────────────────────

const scheduleMoney = z
  .number()
  .finite()
  .min(0, "Amount cannot be negative")
  .max(1_000_000_000, "Amount looks wrong — over ₹100 crore")
  .nullish();

const optionalDate = z
  .string()
  .regex(DATE_RE, "Use YYYY-MM-DD")
  .nullish()
  .or(z.literal("").transform(() => null));

/**
 * Create/update one Payment Schedule line. `id` present ⇒ update.
 *
 * Balance and Final Balance are NOT accepted: both are derived from
 * amount + GST − (receipt + TDS). Taking them as input would let a caller
 * store a balance that contradicts its own inputs.
 */
export const UpsertScheduleLineSchema = z.object({
  id: z.string().uuid().optional(),
  proposalId: z.string().uuid(),
  milestoneId: z.string().uuid().nullish().or(z.literal("").transform(() => null)),
  paymentType: z.enum(BILLING_PAYMENT_TYPES).default("milestone"),
  productType: z
    .enum(BILLING_SCHEDULE_PRODUCT_TYPES)
    .nullish()
    .or(z.literal("").transform(() => null)),
  description: optionalText(300),
  notes: optionalText(1000),
  amount: z.number().finite().min(0).max(1_000_000_000),
  gstRate: z.number().int().min(0).max(28),
  isFinal: z.boolean().default(false),
  tentativeDate: optionalDate,
  actualDate: optionalDate,
  receiptAmount: scheduleMoney,
  receiptDate: optionalDate,
  // TDS is a rate now; the rupee figure is derived from it in the action.
  tdsRate: z.number().int().refine((n) => (BILLING_TDS_RATES_ACCEPTED as readonly number[]).includes(n), "Unsupported TDS rate").default(0),
});
export type UpsertScheduleLineInput = z.infer<typeof UpsertScheduleLineSchema>;

// ── People Allocation ──────────────────────────────────────────────────────

const uuidOrNull = z.string().uuid().nullish().or(z.literal("").transform(() => null));

export const AllocationScopeRowSchema = z.object({
  /**
   * Product. Accepts the current Billing product codes AND the legacy scope
   * values, so a line saved before the switch still saves back unchanged.
   */
  /**
   * Product. Accepts the named product codes AND the older billing/scope codes,
   * so a line saved before this list existed still saves back unchanged.
   */
  scope: z
    .string()
    .trim()
    .refine(
      (v) =>
        ALLOCATION_PRODUCT_CODES.includes(v) ||
        (BILLING_PRODUCTS as readonly string[]).includes(v) ||
        (ALLOCATION_SCOPES as readonly string[]).includes(v),
      "Unknown product",
    ),
  /** Start Date / End Date in the UI; the columns keep their original names. */
  dueDate: optionalDate,
  actualDate: optionalDate,
  billRaise: z.enum(BILL_RAISE_OPTIONS).nullish().or(z.literal("").transform(() => null)),
});

/**
 * Create/update an allocation. `id` present ⇒ update.
 *
 * Member lists are filtered of blanks and de-duplicated: the form renders empty
 * member slots, and the same person must not be staffed twice on one team.
 */
export const UpsertAllocationSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid("Select a client"),
  appLeadId: uuidOrNull,
  appMemberIds: z.array(z.string().uuid()).max(20).default([]).transform((v) => [...new Set(v)]),
  handholdingLeadId: uuidOrNull,
  handholdingMemberIds: z.array(z.string().uuid()).max(20).default([]).transform((v) => [...new Set(v)]),
  notes: optionalText(2000),
  scopes: z.array(AllocationScopeRowSchema).max(50).default([]),
});
export type UpsertAllocationInput = z.infer<typeof UpsertAllocationSchema>;
