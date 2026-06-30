import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock, Search, Feather } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { MODULE_THEME, MODULE_ORDER, type ModuleTheme } from "@/lib/module-theme";
import { HubSignOut } from "@/components/hub/hub-signout";
import { GlobalSearch } from "@/components/header/global-search";

/**
 * THE FRONT DOOR — post-login Hub launcher.
 *
 * Each workspace is a full-bleed PHOTO card tinted in that module's signature
 * colour (meeting 2026-06-29: colour-per-module so you always know where you
 * are). The module name + tagline sit large over the image; the accent, photo
 * and copy all come from the single MODULE_THEME source of truth. WMS has no
 * photo (the founder is designing its logo) so it renders as a branded red
 * gradient card. Server Component; the only interactive islands are sign-out
 * and the ⌘K search trigger.
 */

function WorkspaceCard({ m, locked, i }: { m: ModuleTheme; locked: boolean; i: number }) {
  const Icon = m.Icon;
  const delay = { animationDelay: `${i * 70}ms` } as const;

  const inner = (
    <>
      {/* Background: photo (tinted) or a solid branded gradient (WMS). */}
      {m.image ? (
        <Image
          src={m.image}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-[450ms] ease-out group-hover:scale-[1.06]"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(145deg, ${m.accent}, ${m.accentDeep})` }}
        />
      )}

      {/* Colour scrim — tints the whole card in the module colour and keeps the
          name legible at the bottom. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: m.image
            ? `linear-gradient(to top, ${m.accentDeep} 4%, color-mix(in srgb, ${m.accentDeep} 60%, transparent) 40%, color-mix(in srgb, ${m.accentDeep} 14%, transparent) 78%)`
            : "linear-gradient(to top, rgba(0,0,0,0.34), transparent 70%)",
        }}
      />
      {/* Top accent rule */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: m.accent }} />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-6">
        <span
          className="inline-flex size-12 items-center justify-center rounded-2xl backdrop-blur-sm"
          style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)" }}
        >
          <Icon size={24} strokeWidth={2.2} className="text-white" />
        </span>
        <div>
          <h3 className="text-[30px] font-extrabold leading-none tracking-tight text-white drop-shadow-sm max-md:text-[26px]">
            {m.label}
          </h3>
          <p className="mt-2 max-w-[300px] text-[15px] font-medium leading-snug text-white/90">
            {m.tagline}
          </p>
          {locked ? (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-black/30 px-3 py-1.5 text-[13.5px] font-bold text-white/90 backdrop-blur-sm">
              <Lock size={14} strokeWidth={2.5} /> No access
            </span>
          ) : (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-white px-3.5 py-1.5 text-[14px] font-bold" style={{ color: m.accentDeep }}>
              Enter workspace
              <ArrowRight size={15} strokeWidth={2.8} className="transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  const base =
    "wg-rise group relative block h-[270px] overflow-hidden rounded-3xl shadow-md max-md:h-[230px]";

  if (locked) {
    return (
      <div className={`${base} grayscale`} style={delay} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={m.href}
      aria-label={`Open ${m.label}`}
      className={`${base} transition duration-200 hover:-translate-y-1.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
      style={{ ...delay, "--tw-ring-color": m.accent } as React.CSSProperties}
    >
      {inner}
    </Link>
  );
}

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;
  const access = accessFor(me);

  return (
    <main className="min-h-[100dvh] w-full" style={{ background: "linear-gradient(180deg, #f6f7f9 0%, #fbfbfc 38%, #ffffff 100%)" }}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-9 max-md:px-5 max-md:py-6">
        {/* Header — BIG Altus logo + prominent sign-out */}
        <header className="flex items-center justify-between gap-4">
          <Image
            src="/logo.png"
            alt="Altus Corp"
            width={170}
            height={188}
            priority
            className="h-[120px] w-auto max-md:h-[88px]"
          />
          <div className="flex items-center gap-4">
            <span className="text-[16px] text-ink-soft max-sm:hidden">
              Hi, <strong className="font-bold text-ink-strong">{firstName}</strong>
            </span>
            <HubSignOut />
          </div>
        </header>

        {/* Hero — centered */}
        <section className="mt-8 mb-9 flex flex-col items-center text-center">
          <span className="text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red)" }}>
            Altus&nbsp;/&nbsp;Workspaces
          </span>
          <h1 className="mt-2.5 font-extrabold tracking-tight text-ink-strong" style={{ fontSize: "clamp(38px, 4.8vw, 58px)", lineHeight: 1.03 }}>
            Welcome back, {firstName}
          </h1>
          <p className="mt-3 text-[18px] text-ink-muted">Choose your workspace to get started</p>
        </section>

        {/* Workspace grid */}
        <section className="grid grid-cols-3 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1" aria-label="Workspaces">
          {MODULE_ORDER.map((id, i) => (
            <WorkspaceCard key={id} m={MODULE_THEME[id]} locked={!canAccessWorkspace(id, access)} i={i} />
          ))}
        </section>

        {/* Global search bar */}
        <section className="mt-6 rounded-2xl border border-hairline bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-5 max-md:flex-col max-md:items-stretch">
            <div className="flex items-center gap-3.5">
              <span className="inline-flex size-11 items-center justify-center rounded-xl" style={{ background: "#eef1f6" }}>
                <Feather size={20} strokeWidth={2.1} style={{ color: "var(--color-ink-soft)" }} />
              </span>
              <div>
                <div className="text-[15.5px] font-bold text-ink-strong">Need something specific?</div>
                <div className="text-[13.5px] text-ink-muted">Use global search to find anything across workspaces.</div>
              </div>
            </div>
            <GlobalSearch
              trigger={
                <button
                  type="button"
                  aria-label="Search across workspaces"
                  className="flex h-12 w-[440px] max-w-full items-center gap-3 rounded-xl border border-hairline-strong bg-surface-soft px-4 text-ink-subtle transition-colors hover:border-altus-red hover:bg-white max-md:w-full"
                >
                  <Search size={18} strokeWidth={2.2} className="shrink-0" />
                  <span className="flex-1 text-left text-[14.5px]">Search across workspaces…</span>
                  <kbd className="inline-flex items-center gap-0.5 rounded-md border border-hairline bg-white px-1.5 py-0.5 text-[11.5px] font-bold text-ink-subtle">⌘K</kbd>
                </button>
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}
