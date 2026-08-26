/**
 * Absolute site URL. Needed by anything that has to emit a full URL with no
 * request in hand: OpenGraph tags, the sitemap, JSON-LD.
 *
 * The production host is the real domain, üticket.com — written in its ASCII
 * (punycode) form because that is what link previews, crawlers and mail
 * clients handle reliably; browsers display the accented form on their own.
 * `www` is canonical: the apex 308-redirects to it.
 *
 * Preview deployments fall back to their own *.vercel.app host so a branch's
 * share cards point at that branch, and local dev to localhost.
 * NEXT_PUBLIC_SITE_URL overrides everything, for anyone running the app
 * behind a different host.
 */
const PRODUCTION_URL = "https://www.xn--ticket-2ya.com";

function resolveSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

export const SITE_URL = new URL(resolveSiteUrl());

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}
