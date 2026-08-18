/**
 * Verify a GST provider key without going through the UI.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/gst-check.ts 27AAPFU0939F1ZV
 *
 * Prints which providers are configured, then the raw outcome of the lookup, so
 * a key can be confirmed (or a bad key diagnosed) in seconds.
 */
import { configuredProviders, decodeGstin, fetchFromRegistry } from "../lib/billing/gst-registry";

async function main() {
  const gstin = process.argv[2];
  if (!gstin) {
    console.error("usage: gst-check.ts <GSTIN>");
    process.exit(1);
  }

  const d = decodeGstin(gstin);
  console.log(`GSTIN     : ${d.gstin}`);
  console.log(`format    : ${d.formatOk ? "ok" : "MALFORMED"}   check digit: ${d.checksumOk ? "ok" : "mismatch (advisory only)"}`);
  console.log(`state     : ${d.stateName ?? "?"} (${d.stateCode})`);
  console.log(`PAN       : ${d.pan}`);

  const providers = configuredProviders();
  console.log(`providers : ${providers.length ? providers.join(", ") : "NONE CONFIGURED"}`);

  const res = await fetchFromRegistry(d.gstin);
  if (res.ok) {
    console.log(`\n✅ COMPANY NAME: ${res.hit.name}`);
    console.log(`   legal   : ${res.hit.legalName ?? "—"}`);
    console.log(`   trade   : ${res.hit.tradeName ?? "—"}`);
    console.log(`   status  : ${res.hit.status ?? "—"}`);
    console.log(`   address : ${res.hit.address ?? "—"}`);
    console.log(`   via     : ${res.hit.provider}`);
  } else {
    console.log(`\n❌ ${res.reason.toUpperCase()}\n   ${res.message}`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
