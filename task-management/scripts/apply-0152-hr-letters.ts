// Apply migration 0152 — HR Letters / Documents engine (ADDITIVE: three new
// tables — letter_templates, document_instances, ctc_breakups — backing the
// 26-type HR letters program). Also UPSERTS the 26 canonical letter_templates
// seed rows (insert … on conflict(type_key) do nothing) so the hub has editable
// templates on first load.
//
// Idempotent — safe to re-run (schema via `create table if not exists`, seed via
// on-conflict-do-nothing; existing admin edits are never overwritten). Apply path
// (drizzle journal is stale by design):
//   pnpm tsx --env-file=.env.local scripts/apply-0152-hr-letters.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { templateSeedRows } from "../lib/hr-docs/templates-seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0152_hr_letters.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0152_hr_letters.sql') on conflict do nothing`,
  );

  // Seed the 26 canonical templates. on-conflict-do-nothing so a re-run never
  // clobbers an admin's edited body.
  const rows = templateSeedRows();
  let inserted = 0;
  for (const r of rows) {
    const res = await sql`
      insert into letter_templates (category, type_key, title, body_md, "trigger", signature, content)
      values (${r.category}, ${r.typeKey}, ${r.title}, ${r.bodyMd}, ${r.trigger}, ${r.signature}, ${r.content})
      on conflict (type_key) do nothing
    `;
    inserted += res.count;
  }

  const totalRows = (await sql`
    select count(*)::int as count from letter_templates
  `) as unknown as { count: number }[];
  const total = totalRows[0]?.count ?? 0;

  console.log(`OK — applied ${FILE}`);
  console.log(
    `   letter_templates: ${inserted} seeded this run, ${total} total (of ${rows.length} canonical types)`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
