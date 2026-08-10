/**
 * The app footer bar. Every page renders it as the LAST sibling of its top-level
 * fragment (header → main → footer), and ChromeShell makes that fragment's parent
 * a full-height flex column — so `mt-auto` eats all leftover vertical space and
 * pins the bar to the bottom of the viewport on short pages, while still sitting
 * directly under the content on long ones. (Not `fixed`: it must scroll away, not
 * overlay the page.)
 *
 * That chain runs THROUGH `app/(app)/template.tsx`, which must stay a growing
 * flex column — as a plain block wrapper it silently strands `mt-auto` and the
 * bar floats mid-viewport on short pages. Change the two together.
 */
export function DashboardFooter() {
  return (
    <footer
      className="mt-auto"
      style={{
        background:
          "linear-gradient(180deg, var(--color-ink-strong) 0%, #020617 100%)",
        color: "#ffffff",
      }}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2.5 px-12 py-2.5 max-md:px-4 text-center">
        <a
          href="https://altuscorp.in"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Altus Corp — altuscorp.in (opens in a new tab)"
          className="inline-flex items-center rounded-md bg-white px-1.5 py-1"
          style={{ boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)" }}
        >
          <img
            src="/logo.png"
            alt="Altus Corp"
            style={{ height: 18, width: "auto", display: "block" }}
          />
        </a>
        <p className="text-xs" style={{ color: "rgba(255, 255, 255, 0.55)" }}>
          © Altus Corp 2025–2035 · All rights reserved
        </p>
      </div>
    </footer>
  );
}
