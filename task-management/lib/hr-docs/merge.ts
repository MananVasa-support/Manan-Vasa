// HR Letters / Documents engine — {{mergeField}} resolution. CLIENT-SAFE + pure
// (no db, node, env, server-only): the template editor uses MERGE_FIELDS to show
// the available tokens, and both server render + client preview call resolveMerge
// with an employee row + extra form values to build the substitution map.
//
// The renderer (Phase 2) substitutes {{token}} occurrences in a body_md with the
// resolved map; unresolved tokens are left blank so an admin sees what's missing.

/** The company name — fixed across the Altus letterhead. */
export const COMPANY_NAME = "Altus Corp";

/**
 * The minimal employee shape resolveMerge reads. Deliberately loose (all
 * optional) so callers can pass a full `employees` row, a partial projection,
 * or nothing (pre-hire candidate — everything then comes from `extra`).
 * FK-derived fields (designation, manager) are resolved by the action layer and
 * handed in via `extra`, since this function stays query-free.
 */
export interface EmployeeMergeSource {
  name?: string | null;
  email?: string | null;
  department?: string | null;
  joinedAt?: Date | string | null;
}

/** One selectable token in the template-editor merge-field catalog. */
export interface MergeFieldSpec {
  /** the token name, used as {{token}} */
  token: string;
  /** human label for the picker */
  label: string;
  /** one-line helper */
  hint: string;
}

/**
 * MERGE_FIELDS — the catalog of {{fields}} the template editor offers. Every
 * token here is produced by resolveMerge (from the employee row, sensible
 * defaults, or `extra`). Grouped loosely: identity, role, dates, company.
 */
export const MERGE_FIELDS: readonly MergeFieldSpec[] = [
  { token: "name", label: "Full name", hint: "The employee or candidate's full name." },
  { token: "firstName", label: "First name", hint: "First word of the full name." },
  { token: "email", label: "Email", hint: "The employee or candidate's email address." },
  { token: "designation", label: "Designation", hint: "Job title / role." },
  { token: "department", label: "Department", hint: "The employee's department." },
  { token: "reportingManager", label: "Reporting manager", hint: "Name of the person they report to." },
  { token: "joiningDate", label: "Joining date", hint: "Date of joining (formatted)." },
  { token: "date", label: "Letter date", hint: "The date this letter is issued (defaults to today)." },
  { token: "place", label: "Place", hint: "City / place of issue." },
  { token: "company", label: "Company", hint: "The issuing company (Altus Corp)." },
  { token: "ctc", label: "CTC", hint: "Annual cost-to-company (as written on the offer)." },
  { token: "probationMonths", label: "Probation (months)", hint: "Length of the probation period." },
  { token: "noticePeriod", label: "Notice period", hint: "Notice period on separation." },
  { token: "lastWorkingDay", label: "Last working day", hint: "Final working date (separation letters)." },
  { token: "hrName", label: "HR signatory", hint: "Name of the HR person signing off." },
];

/** Format a Date / ISO string as "23 July 2026". Falls back to the raw string. */
export function formatMergeDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Build the {{field}} → value map from an employee row + extra form values.
 * Pure: `extra` always WINS over derived values, so a composer can override any
 * token (e.g. supply designation/manager the query layer resolved, or fill a
 * candidate's details for a pre-hire letter). `company` and `date` get sensible
 * defaults when not supplied.
 */
export function resolveMerge(
  employee: EmployeeMergeSource | null | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const name = (extra.name ?? employee?.name ?? "").trim();
  const map: Record<string, string> = {
    name,
    firstName: name ? firstName(name) : "",
    email: (employee?.email ?? "").trim(),
    department: (employee?.department ?? "").trim(),
    designation: "",
    reportingManager: "",
    joiningDate: formatMergeDate(employee?.joinedAt),
    date: formatMergeDate(new Date()),
    place: "",
    company: COMPANY_NAME,
    ctc: "",
    probationMonths: "",
    noticePeriod: "",
    lastWorkingDay: "",
    hrName: "",
  };

  // Extra overrides everything (trimmed). Only non-undefined keys apply; a
  // caller-supplied empty string is a deliberate blank and is respected.
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue;
    map[k] = typeof v === "string" ? v : String(v);
  }
  // firstName stays consistent if name was overridden by extra.
  if (extra.name !== undefined) map.firstName = firstName(map.name ?? "");
  return map;
}

/**
 * Substitute {{token}} occurrences in a body using a resolved merge map.
 * Unknown tokens resolve to an empty string. Whitespace inside the braces is
 * tolerated ({{ name }} === {{name}}). Shared by server render + client preview.
 */
export function applyMerge(body: string, map: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token: string) => {
    const v = map[token];
    return v === undefined || v === null ? "" : String(v);
  });
}
