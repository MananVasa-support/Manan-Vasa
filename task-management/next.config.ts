import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  // Ship the hand-crafted Goals bulk-import workbook INTO the template route's
  // serverless function bundle (public/ assets are CDN-served and NOT guaranteed
  // to be on the function filesystem, so a bare readFile would 500 in prod).
  outputFileTracingIncludes: {
    "/goals/template.xlsx": ["./public/templates/Altus-Goals-Template.xlsx"],
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
