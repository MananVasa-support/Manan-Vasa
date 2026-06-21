// perf-waterfall.ts — verify the pooler-cascade fix against LIVE prod.
//
// Mints a real admin session (Firebase custom-token → idToken →
// /api/auth/session → __session cookie), then:
//   (1) times back-to-back GET /?full=1 loads (the original sequential probe),
//   (2) fires a CONCURRENT BURST of dashboard loads (the morning-rush repro),
//   (3) snapshots pg_stat_activity for stuck/orphaned queries.
//
// A "rendered" dashboard is ~330KB; the 18s timeout error card is ~66KB, so we
// flag any load that's small OR slow. Before the fix you'd see render/stall/
// render alternation + queries stuck in Client/ClientRead. After: all render.
//
// Usage: pnpm tsx --env-file=.env.local scripts/perf-waterfall.ts
import postgres from "postgres";
import admin from "firebase-admin";

const BASE = process.env.PERF_BASE_URL ?? "https://wms.mananvasa.com";
const SEQ_LOADS = 6;
const BURST = 10;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 2, prepare: false });

function fmt(ms: number) {
  return `${ms.toString().padStart(6)}ms`;
}

async function loadDashboard(cookie: string) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/?full=1`, {
    headers: { cookie, "user-agent": "perf-waterfall" },
    redirect: "manual",
  });
  const body = await res.text();
  const ms = Math.round(performance.now() - t0);
  const bytes = body.length;
  const rendered = res.status === 200 && bytes > 150_000;
  const errorCard = res.status === 200 && bytes <= 150_000;
  const tag = rendered ? "rendered" : errorCard ? "ERROR-CARD/redirect" : `status=${res.status}`;
  return { ms, bytes, status: res.status, rendered, tag };
}

async function main() {
  console.log(`▸ Target: ${BASE}\n`);

  // 1) Find an admin to impersonate (prefer the operator's own account).
  const rows = await sql<{ firebase_uid: string; email: string; name: string }[]>`
    SELECT firebase_uid, email, name
      FROM employees
     WHERE is_admin = true AND is_active = true AND firebase_uid IS NOT NULL
     ORDER BY (email = 'altus@carbideindia.com') DESC, name
     LIMIT 1`;
  if (!rows[0]) throw new Error("No active admin with a firebase_uid found.");
  const me = rows[0];
  console.log(`▸ Impersonating admin: ${me.name} <${me.email}>`);

  // 2) Firebase custom token → idToken.
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  }
  const customToken = await admin.auth().createCustomToken(me.firebase_uid);
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exJson = (await exchange.json()) as { idToken?: string; error?: { message: string } };
  if (!exJson.idToken) throw new Error(`custom-token exchange failed: ${exJson.error?.message}`);

  // 3) Mint the __session cookie.
  const sessRes = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: exJson.idToken }),
  });
  const setCookies = sessRes.headers.getSetCookie?.() ?? [];
  const sessionCookie = setCookies
    .map((c) => c.split(";")[0] ?? "")
    .find((c) => c.startsWith("__session="));
  if (!sessionCookie) throw new Error(`no __session cookie returned (status ${sessRes.status})`);
  console.log(`▸ Session minted ✓\n`);

  // 4) Sequential back-to-back loads.
  console.log(`=== Sequential ${SEQ_LOADS} × GET /?full=1 (back-to-back) ===`);
  const seq: number[] = [];
  for (let i = 1; i <= SEQ_LOADS; i++) {
    const r = await loadDashboard(sessionCookie);
    seq.push(r.ms);
    console.log(`  load ${i}: ${fmt(r.ms)}  bytes=${r.bytes.toString().padStart(7)}  ${r.tag}`);
  }

  // 5) Concurrent burst — the real "many employees at once" repro.
  console.log(`\n=== Concurrent burst: ${BURST} simultaneous dashboard loads ===`);
  const tBurst = performance.now();
  const results = await Promise.all(Array.from({ length: BURST }, () => loadDashboard(sessionCookie)));
  const burstMs = Math.round(performance.now() - tBurst);
  const renderedCount = results.filter((r) => r.rendered).length;
  const slow = results.filter((r) => r.ms > 5000).length;
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)];
  const p100 = sorted[sorted.length - 1];
  console.log(`  wall=${burstMs}ms  rendered=${renderedCount}/${BURST}  slow(>5s)=${slow}  p50=${p50}ms  max=${p100}ms`);
  results.forEach((r, i) => console.log(`    #${(i + 1).toString().padStart(2)}: ${fmt(r.ms)}  ${r.tag}`));

  // 6) pg_stat_activity snapshot — look for stuck/orphaned app queries.
  const act = await sql<{ state: string; wait_event: string | null; secs: number; q: string }[]>`
    SELECT state,
           wait_event,
           round(EXTRACT(EPOCH FROM (now() - query_start)))::int AS secs,
           left(query, 60) AS q
      FROM pg_stat_activity
     WHERE application_name = 'altus-wms'
       AND state IS NOT NULL
     ORDER BY secs DESC NULLS LAST
     LIMIT 15`;
  console.log(`\n=== pg_stat_activity (application_name='altus-wms') ===`);
  if (!act.length) {
    console.log("  (no tagged connections currently — pool idle/recycled)");
  } else {
    for (const a of act) {
      const flag = a.secs > 10 ? "  ⚠️ STUCK" : "";
      console.log(`  ${(a.secs ?? 0).toString().padStart(3)}s  state=${a.state} wait=${a.wait_event ?? "-"}  ${a.q}${flag}`);
    }
  }

  // Verdict.
  const seqSlow = seq.filter((m) => m > 5000).length;
  console.log(`\n=== VERDICT ===`);
  if (seqSlow === 0 && slow === 0 && renderedCount === BURST) {
    console.log("  ✅ No stalls. All loads rendered fast, even under concurrent burst. Cascade not reproduced.");
  } else {
    console.log(`  ⚠️ ${seqSlow} sequential + ${slow} burst loads were slow (>5s). The stall pattern is still present.`);
  }

  await sql.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("perf-waterfall failed:", e);
  await sql.end().catch(() => {});
  process.exit(1);
});
