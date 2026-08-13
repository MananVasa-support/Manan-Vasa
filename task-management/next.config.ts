import type { NextConfig } from "next";

// The @sparticuz/chromium binary pack (pnpm-hoisted, any version) — traced into
// the rich-letter PDF routes so executablePath() finds it at runtime on Vercel.
const CHROMIUM_BIN =
  "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**";

// Security response headers (applied to every route). The CSP is deliberately
// BALANCED: strict on the structural directives that stop clickjacking / base-tag
// / form-hijack / plugin embeds (frame-ancestors, base-uri, form-action,
// object-src), but permissive on script/style/connect where the app legitimately
// needs it — inline <style>/style= are used app-wide, and it talks to Firebase +
// Supabase (+ realtime wss) over https. `unsafe-inline`/`unsafe-eval` are kept so
// a live app used by real staff doesn't break; a nonce/hash-based script CSP is a
// separate hardening pass. Stored-HTML XSS is closed at the source (sanitised on
// save) rather than relying on CSP alone.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // The app USES camera (attendance selfie / work camera), microphone and
  // geolocation (geofence) — allow those to self; deny the rest by default.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Ship the hand-crafted Goals bulk-import workbook INTO the template route's
  // serverless function bundle (public/ assets are CDN-served and NOT guaranteed
  // to be on the function filesystem, so a bare readFile would 500 in prod).
  outputFileTracingIncludes: {
    "/goals/template.xlsx": ["./public/templates/Altus-Goals-Template.xlsx"],
    // @sparticuz/chromium's binary lives in its `bin/` dir and is unpacked at
    // RUNTIME by executablePath() — nothing statically imports it, so Vercel's
    // file-tracing drops it from the function ("input directory …/bin does not
    // exist"). Force-include it into every route that renders a RICH letter PDF
    // with headless Chromium. The @* matches whatever pnpm-hoisted version is
    // installed (currently @sparticuz/chromium@149).
    // Rich letters print on headless Chromium, which ships NO fonts — the
    // self-hosted letter fonts (public/letter-fonts/*.woff2) are read off disk
    // and base64-embedded per render (render-rich.ts). Like the chromium binary,
    // these public/ assets are CDN-served and NOT guaranteed to be on the
    // function filesystem, so trace the whole dir into each PDF route.
    "/api/hr/letters/issue-rich": [CHROMIUM_BIN, "./public/letter-fonts/**"],
    "/api/hr/letters/pdf": [CHROMIUM_BIN, "./public/letter-fonts/**"],
    "/api/hr/letters/email-pdf": [CHROMIUM_BIN, "./public/letter-fonts/**"],
  },
  // Externalize heavy server packages so the bundler does NOT compile their huge
  // trees into every route (the Sentry + OpenTelemetry + Prisma-instrumentation
  // graph was adding ~50s to first-compile of EVERY page). They're require()'d at
  // runtime from node_modules instead. Sentry has no build-time hook here (config
  // isn't wrapped with withSentryConfig), so externalizing the runtime SDK is safe.
  serverExternalPackages: [
    "firebase-admin",
    "pdfkit",
    // Server-only headless-Chromium PDF renderer for rich ("Google Docs") HR
    // letters. Externalized like pdfkit so their large native/binary trees are
    // require()'d at runtime and never compiled into a route graph (and NEVER a
    // client one). Imported lazily inside the server function that runs them.
    "puppeteer-core",
    "@sparticuz/chromium",
    "@sentry/nextjs",
    "@sentry/node",
    "@opentelemetry/instrumentation",
    "@prisma/instrumentation",
  ],
};

export default nextConfig;
