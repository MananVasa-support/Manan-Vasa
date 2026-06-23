import type { NextConfig } from "next";

/**
 * Baseline security response headers, applied to every route.
 *
 * - HSTS: pin HTTPS on the production domain (anti-downgrade / MITM / replay).
 *   Harmless on the LAN HTTP install — browsers ignore HSTS sent over HTTP.
 * - nosniff: browsers must honor the declared Content-Type and never MIME-sniff
 *   an upload/response into something executable (hardens file-upload handling).
 * - X-Frame-Options SAMEORIGIN: anti-clickjacking (the native app talks to the
 *   API, it never iframes the web UI, so this is safe).
 * - Referrer-Policy: don't leak full URLs (which can carry ids) cross-origin.
 *
 * Deliberately NOT adding a Content-Security-Policy or Permissions-Policy here:
 * the app relies on inline styles + uses geolocation/camera (attendance geofence
 * + biometric + avatar crop), so a blind CSP/Permissions-Policy would break live
 * features — that needs a dedicated, tested pass.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  serverExternalPackages: ["firebase-admin", "pdfkit"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
