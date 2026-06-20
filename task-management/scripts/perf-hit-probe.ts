// Mints an admin session, then hits the in-region probe (/api/health?deep=1) N times.
//   pnpm tsx --env-file=.env.local scripts/perf-hit-probe.ts
export {};
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import postgres from "postgres";

const SITE = "https://wms.mananvasa.com";
const napms = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mintCookie(): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, idle_timeout: 5 });
  const [a] = await sql<{ firebase_uid: string }[]>`select firebase_uid from employees where is_admin=true and firebase_uid is not null and is_active=true order by email limit 1`;
  await sql.end();
  if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
  const ct = await getAuth().createCustomToken(a.firebase_uid);
  const ex = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }) })).json();
  const s = await fetch(`${SITE}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: ex.idToken }) });
  return (s.headers.get("set-cookie") ?? "").match(/__session=[^;]+/)?.[0] ?? "";
}

async function hit(cookie: string, label: string) {
  const t = Date.now();
  const res = await fetch(`${SITE}/api/health?deep=1`, { headers: { cookie } });
  const wall = Date.now() - t;
  const j = (await res.json()) as Record<string, unknown>;
  if (!j.ok || !Array.isArray(j.steps)) { console.log(`${label}: status=${res.status} ${JSON.stringify(j).slice(0, 200)}`); return; }
  console.log(`\n${label}  [client-wall=${wall}ms region=${j.region} cold=${j.coldInstance} uptime=${j.instanceUptimeSec}s server-total=${j.totalMs}ms dashPromiseAll=${j.dashboardPromiseAllMs}ms]`);
  for (const s of j.steps as Record<string, unknown>[]) {
    console.log(`   ${String(s.ms).padStart(8)}ms ${s.ok ? " " : "x"} ${s.step}${s.rows != null ? `  (${s.rows} rows)` : ""}${s.error ? `  ERR:${s.error}` : ""}`);
  }
}

async function run() {
  const cookie = await mintCookie();
  if (!cookie) throw new Error("could not mint session cookie");
  await hit(cookie, "RUN 1 (maybe cold)");
  await napms(1500); await hit(cookie, "RUN 2 (warm)");
  await napms(1500); await hit(cookie, "RUN 3 (warm)");
  await napms(1500); await hit(cookie, "RUN 4 (warm)");
}
run().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
