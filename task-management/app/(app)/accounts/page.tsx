import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";
import { AccountsIndex } from "@/components/accounts/accounts-index";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireAccountsAccess } from "@/lib/accounts/access";

export const dynamic = "force-dynamic";

// Admin / Accounts module identity — indigo (meeting 2026-06-29: a colour per
// module so you always know where you are). The full bespoke indigo chrome
// rolls across the sub-pages next; this establishes the accent on the front door.
const ACCENT = MODULE_THEME.accounts.accentDeep;

export default async function AccountsIndexPage() {
  // Guard IN THE PAGE — super-admins or the Accounts department only. The (app)
  // layout gate alone isn't reliable on prod (a Next.js layout-redirect quirk),
  // so every accounts surface must assert access itself.
  await requireAccountsAccess();
  const sections = [...ACCOUNTS_SECTIONS].sort((a, b) => a.order - b.order);
  const built = sections.filter((s) => s.status === "built").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-8 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#ffffff", background: `linear-gradient(135deg, ${MODULE_THEME.accounts.accent}, ${ACCENT})` }}
          >
            Admin · Accounts
          </span>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.6vw, 46px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
              maxWidth: "22ch",
            }}
          >
            Accounts Totality, Compliance, Checklist &amp; Trackers
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "62ch" }}>
            One front door to every accounts checklist, compliance tracker and
            master register. {built} of {sections.length} sections are live —
            the rest are scaffolded and ready to wire.
          </p>
        </header>

        <AccountsIndex sections={sections} />
      </main>
      <DashboardFooter />
    </>
  );
}
