import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  // Externalize heavy server packages so the bundler does NOT compile their huge
  // trees into every route (the Sentry + OpenTelemetry + Prisma-instrumentation
  // graph was adding ~50s to first-compile of EVERY page). They're require()'d at
  // runtime from node_modules instead. Sentry has no build-time hook here (config
  // isn't wrapped with withSentryConfig), so externalizing the runtime SDK is safe.
  serverExternalPackages: [
    "firebase-admin",
    "pdfkit",
    "@sentry/nextjs",
    "@sentry/node",
    "@opentelemetry/instrumentation",
    "@prisma/instrumentation",
  ],
};

export default nextConfig;
