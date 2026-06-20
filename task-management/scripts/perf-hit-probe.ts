// Hits the in-region perf probe (folded into /api/health?deep=) N times.
//   pnpm tsx --env-file=.env.local scripts/perf-hit-probe.ts
export {};
const PROBE = "https://wms.mananvasa.com/api/health";
const secret = process.env.CRON_SECRET;
const napms = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hit(label: string) {
  const t = Date.now();
  const res = await fetch(`${PROBE}?deep=${encodeURIComponent(secret ?? "")}`);
  const wall = Date.now() - t;
  const j = (await res.json()) as Record<string, unknown>;
  if (!j.ok || !Array.isArray(j.steps)) { console.log(`${label}: status=${res.status} ${JSON.stringify(j).slice(0, 200)}`); return; }
  console.log(`\n${label}  [client-wall=${wall}ms region=${j.region} cold=${j.coldInstance} uptime=${j.instanceUptimeSec}s total=${j.totalMs}ms dashPromiseAll=${j.dashboardPromiseAllMs}ms]`);
  for (const s of j.steps as Record<string, unknown>[]) {
    console.log(`   ${String(s.ms).padStart(8)}ms ${s.ok ? " " : "x"} ${s.step}${s.rows != null ? `  (${s.rows} rows)` : ""}${s.error ? `  ERR:${s.error}` : ""}`);
  }
}

async function run() {
  if (!secret) throw new Error("CRON_SECRET not in env");
  await hit("RUN 1 (maybe cold)");
  await napms(1500); await hit("RUN 2 (warm)");
  await napms(1500); await hit("RUN 3 (warm)");
  await napms(1500); await hit("RUN 4 (warm)");
}
run().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
