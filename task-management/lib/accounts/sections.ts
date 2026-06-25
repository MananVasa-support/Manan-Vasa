/**
 * Data-driven registry for the Accounts module's Index. Reorder/add sections by
 * editing this one array — the Index page and routing read from it, no other
 * code changes needed. `status: "built"` renders the real section; `"stub"`
 * renders a clean, ready-to-extend scaffold pre-seeded with the source columns.
 */
export interface AccountsSection {
  /** URL slug → /accounts/<slug> */
  slug: string;
  /** Display order on the Index. */
  order: number;
  title: string;
  blurb: string;
  /**
   * `built` renders a real section under /accounts/<slug>; `stub` renders a
   * ready-to-extend scaffold; `link` is a real, already-built feature that lives
   * elsewhere in the app — the card (and the /accounts/<slug> route) sends the
   * user straight to `href`.
   */
  status: "built" | "stub" | "link";
  /** Destination for `status: "link"` sections (an in-app route). */
  href?: string;
  /** CA Handover etc. — restricted to admins only within the module. */
  sensitive?: boolean;
  /** Source columns (from the master sheet) — drives the stub preview. */
  columns?: string[];
}

export const ACCOUNTS_SECTIONS: AccountsSection[] = [
  {
    slug: "task-list",
    order: 1,
    title: "Accounts Task List",
    blurb: "Working task tracker — area, status, target/actual dates, with a Screenshots-to-Post sub-table.",
    status: "built",
  },
  {
    slug: "weekly-checklist",
    order: 2,
    title: "Weekly Checklist",
    blurb: "Recurring weekly compliance checklist with per-week completion.",
    status: "stub",
    columns: ["S. No.", "Weekly Checklist", "Deadline", "Category", "Responsible Person", "Accounts Notes", "Manan Sir Notes", "Link to File", "Frequency", "Wk1", "Wk2", "Wk3", "Wk4", "Wk5"],
  },
  {
    slug: "monthly-quarterly-annual",
    order: 3,
    title: "Quarter / Month / Annual Checklist",
    blurb: "Monthly, quarterly and annual things to get done, tracked per month.",
    status: "stub",
    columns: ["S. No.", "Monthly Things to Get Done", "Responsible Person", "Deadline", "Type", "Accounts Notes", "Manan Sir Notes", "Link to File", "Frequency", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
  },
  {
    slug: "cc-tracker",
    order: 4,
    title: "CC Tracker",
    blurb: "Credit-cards master (FY 2025-26) — statements, payments, tally, charges, per month.",
    status: "stub",
    columns: ["S. No", "Entity Name", "Card Name", "ECS", "ECS From?", "Stmt Period", "St Dt", "Due Dt", "Soft Copy Auto Email?", "Hard Copy", "Google Drive", "Tally Entry", "Balance Tally?", "CC Paid Date", "CC Paid Amt", "Int + Fin Chgs", "Chg Reversed?", "Notes"],
  },
  {
    slug: "due-dates",
    order: 5,
    title: "Due Dates Checklist",
    blurb: "Statutory and compliance due-dates checklist.",
    status: "stub",
    columns: ["S. No.", "Particulars", "Due Date", "Responsible", "Status", "Notes"],
  },
  {
    slug: "sip-tracker",
    order: 6,
    title: "SIP Tracker",
    blurb: "SIP / Loans checklist — entity, fund, SIP date, amount, paid per month.",
    status: "stub",
    columns: ["S. No.", "Entity", "Mutual Fund Name", "Location", "SIP Date", "Type", "Amount", "YTD Total", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
  },
  {
    slug: "collection-master",
    order: 7,
    title: "Collection Master",
    blurb: "Income & collections — this is the live Outstanding & Collections tracker (receipts by person, source, mode, entity, GST/TDS). Opens the full dashboard.",
    status: "link",
    href: "/outstanding",
  },
  {
    slug: "fno-income",
    order: 8,
    title: "FNO Income Master",
    blurb: "F&O income master — entity, agency, capital, YTD and monthly % returns.",
    status: "stub",
    columns: ["S. No.", "Entity", "Agency", "Capital", "YTD Rs.", "%", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
  },
  {
    slug: "bank-balance",
    order: 9,
    title: "Bank Balance Tracker",
    blurb: "Bank balances vs target balance, tracked per week with difference.",
    status: "stub",
    columns: ["S. No.", "Entity", "Target Balance", "Weekly balances…", "Difference"],
  },
  {
    slug: "cash-withdrawal",
    order: 10,
    title: "Cash Withdrawal Tracker",
    blurb: "Cash withdrawals — entity, cheque details, amount, per month.",
    status: "stub",
    columns: ["S. No.", "Entity", "Name on Cheque", "Cheque No", "Chq Date", "Amount", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
  },
  {
    slug: "vasa-family-interpersonal",
    order: 11,
    title: "Vasa Family Interpersonal Balance",
    blurb: "Interpersonal reconciliation balances between family entities.",
    status: "stub",
    columns: ["Party", "Owes / Receives", "Counterparty", "Amount", "As on", "Notes"],
  },
  {
    slug: "cc-tracker-2026-27",
    order: 12,
    title: "CC Tracker FY 2026-27",
    blurb: "Credit-cards master for FY 2026-27 — same structure as the 25-26 CC tracker.",
    status: "stub",
    columns: ["S. No", "Entity Name", "Card Name", "ECS", "ECS From?", "Stmt Period", "St Dt", "Due Dt", "Soft Copy Auto Email?", "Hard Copy", "Google Drive", "Tally Entry", "Balance Tally?", "CC Paid Date", "CC Paid Amt", "Int + Fin Chgs", "Chg Reversed?", "Notes"],
  },
  {
    slug: "shares-register",
    order: 13,
    title: "Shares Excel Register",
    blurb: "Register of shareholdings / share transactions.",
    status: "stub",
    columns: ["S. No.", "Entity", "Company", "Folio / Demat", "Qty", "Rate", "Value", "Date", "Notes"],
  },
  {
    slug: "ca-handover",
    order: 14,
    title: "CA Handover — Logins, Passwords & Govt Portals",
    blurb: "Secure vault of portal credentials (Income Tax, GST, TDS, Professional Tax, MLWF) and the filed-returns document archive.",
    status: "built",
    sensitive: true,
  },
  {
    slug: "income-tax-master-folder",
    order: 15,
    title: "Last 3–5 Years Income Tax Master Folder",
    blurb: "Master folder of income-tax records for the last 3–5 years, per entity.",
    status: "stub",
    columns: ["Entity", "FY", "Folder Link", "Notes"],
  },
];

export function getAccountsSection(slug: string): AccountsSection | undefined {
  return ACCOUNTS_SECTIONS.find((s) => s.slug === slug);
}
