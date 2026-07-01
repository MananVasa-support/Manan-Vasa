import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { MODULE_THEME, MODULE_ORDER, type ModuleTheme } from "@/lib/module-theme";
import { HubSignOut } from "@/components/hub/hub-signout";
import { GlobalSearch } from "@/components/header/global-search";

/**
 * THE FRONT DOOR — post-login Hub launcher.
 *
 * Each workspace is a SOLID module-colour card with that module's cut-out
 * artwork (background removed) sitting on the right, fully visible — NO colour
 * scrim over the image. Text lives on the left so it never overlaps the art.
 * Colour, image and copy come from the single MODULE_THEME source of truth.
 * WMS has no art (the founder is designing its logo) → its icon stands in.
 * Server Component; the only interactive islands are sign-out + ⌘K search.
 */

function WorkspaceCard({ m, locked, i }: { m: ModuleTheme; locked: boolean; i: number }) {
  const Icon = m.Icon;
  const delay = { animationDelay: `${i * 70}ms` } as const;

  const inner = (
    <>
      {/* The module's cut-out artwork — fully visible (object-contain) on the
          colour, anchored bottom-right. No scrim, no blur. */}
      {m.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 h-[82%] w-auto max-w-[50%] object-contain object-bottom transition-transform duration-300 group-hover:scale-[1.04]"
          style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.18))" }}
        />
      )}
      {/* WMS (no art) → a large translucent icon as its mark. */}
      {!m.image && (
        <Icon
          size={150}
          strokeWidth={1.6}
          aria-hidden
          className="pointer-events-none absolute -bottom-3 -right-3 text-white/20"
        />
      )}

      {/* Content — left column, constrained so it never sits under the art. */}
      <div className="relative z-10 flex h-full flex-col justify-between p-6">
        <span
          className="inline-flex size-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(255,255,255,0.20)", border: "1px solid rgba(255,255,255,0.35)" }}
        >
          <Icon size={24} strokeWidth={2.2} className="text-white" />
        </span>
        <div className="max-w-[58%]">
          <h3 className="text-[30px] font-extrabold leading-none tracking-tight text-white max-md:text-[26px]">
            {m.label}
          </h3>
          <p className="mt-2 text-[14.5px] font-medium leading-snug text-white/90">
            {m.tagline}
          </p>
          {locked ? (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-black/25 px-3 py-1.5 text-[13.5px] font-bold text-white/90">
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
    "wg-rise group relative block h-full min-h-[190px] overflow-hidden rounded-3xl shadow-md max-lg:h-[230px]";
  const bg = { background: `linear-gradient(145deg, ${m.accent}, ${m.accentDeep})` };

  if (locked) {
    return (
      <div className={`${base} grayscale`} style={{ ...bg, ...delay }} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={m.href}
      aria-label={`Open ${m.label}`}
      className={`${base} transition duration-200 hover:-translate-y-1.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
      style={{ ...bg, ...delay, "--tw-ring-color": m.accent } as React.CSSProperties}
    >
      {inner}
    </Link>
  );
}

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;
  const access = await accessFor(me);

  return (
    <main
      className="flex h-[100dvh] w-full flex-col overflow-hidden max-lg:h-auto max-lg:min-h-[100dvh] max-lg:overflow-visible"
      style={{ background: "linear-gradient(180deg, #f6f7f9 0%, #fbfbfc 38%, #ffffff 100%)" }}
    >
      <div className="mx-auto flex h-full w-full max-w-[1320px] flex-col px-8 py-6 max-md:px-5 max-md:py-5">
        {/* ONE BAND — logo · welcome hero · Hi + sign-out, all on the same level */}
        <header className="flex shrink-0 items-center justify-between gap-6 max-md:flex-col max-md:gap-4 max-md:text-center">
          <Image
            src="/logo.png"
            alt="Altus Corp"
            width={170}
            height={188}
            priority
            className="h-[84px] w-auto shrink-0 max-md:h-[64px]"
          />
          <div className="min-w-0 flex-1 text-center">
            <span className="text-[12px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red)" }}>
              Altus&nbsp;/&nbsp;Workspaces
            </span>
            <h1 className="mt-1 font-extrabold tracking-tight text-ink-strong" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.02 }}>
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-[15px] text-ink-muted">Choose your workspace to get started</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <GlobalSearch />
            <span className="text-[15px] text-ink-soft max-sm:hidden">
              Hi, <strong className="font-bold text-ink-strong">{firstName}</strong>
            </span>
            <HubSignOut />
          </div>
        </header>

        {/* Workspace grid — fills the remaining viewport so the page never scrolls */}
        <section
          className="mt-5 grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-5 max-lg:grid-cols-2 max-lg:grid-rows-none max-sm:grid-cols-1"
          aria-label="Workspaces"
        >
          {MODULE_ORDER.map((id, i) => (
            <WorkspaceCard key={id} m={MODULE_THEME[id]} locked={!canAccessWorkspace(id, access)} i={i} />
          ))}
        </section>
      </div>
    </main>
  );
}
