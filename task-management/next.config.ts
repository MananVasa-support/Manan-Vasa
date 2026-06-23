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
 * Permissions-Policy is intentionally omitted (the app uses geolocation/camera
 * for the attendance geofence + biometric + avatar crop; a blind policy would
 * break those).
 */

/**
 * Content-Security-Policy. Locked down where it's safe and won't break the app,
 * permissive only where the app genuinely needs it:
 *  - script-src allows 'unsafe-inline' because the app + Next ship inline
 *    scripts (incl. the layout zoom-reset) and we're NOT on a nonce pipeline
 *    yet. This is the one soft spot — upgrading to nonce-based 'strict-dynamic'
 *    (which removes 'unsafe-inline') is a follow-up that needs a report-only →
 *    enforce rollout with live testing. Everything else below is tight.
 *  - style-src 'unsafe-inline' is required by React inline styles + inline
 *    <style> blocks; style injection is low-risk vs script.
 *  - connect/img/frame are https/wss-only (Firebase, Supabase realtime, Sentry,
 *    signed-URL avatars/docs) — blocks plaintext + non-https exfiltration.
 *  - object-src 'none', base-uri 'self', form-action 'self', frame-ancestors
 *    'self' shut down plugin, <base>-injection, form-hijack and clickjacking.
 * No `upgrade-insecure-requests` (would break the LAN HTTP install; HSTS pins
 * HTTPS on the prod domain anyway).
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "frame-src 'self' https:",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' https: data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: CSP },
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
