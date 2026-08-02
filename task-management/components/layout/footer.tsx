export function DashboardFooter() {
  return (
    <footer
      className="mt-6"
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
