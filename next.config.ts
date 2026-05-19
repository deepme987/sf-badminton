import type { NextConfig } from 'next';

/**
 * Cache header policy:
 *
 *   /icon-*.png, /apple-icon, /icon, /favicon.ico, /icon-maskable.svg
 *     → immutable for 1 year. Icons are content-stable for the lifetime
 *       of a deploy; if we ever change the artwork we'll bump the path
 *       or rely on the SW cache version bump.
 *
 *   /manifest.webmanifest
 *     → short cache (1 hour). Mutable in principle (name/short_name) so
 *       we want a fresher revalidation cycle.
 *
 *   /api/sessions/upcoming, /api/sessions/past
 *     → 10s cache + 30s SWR. These read endpoints poll-heavy and
 *       slightly-stale data is fine; the dirty cost is one wasted RTT
 *       per ~10s. We deliberately do NOT cache /api/sessions/[id] —
 *       that's the polling target on the detail page and must be fresh
 *       enough to drive the "spot opened up" UX.
 *
 *   /sw.js
 *     → no-cache. We must reach the network on every page load to pick
 *       up SW updates immediately (browsers themselves cap SW cache at
 *       24h, but no-cache makes deploys feel instant).
 *
 * Notes:
 *   - /og/sessions/[id] and /opengraph-image set their own Cache-Control
 *     headers inside their handlers, so they're not duplicated here.
 *   - Next's static asset pipeline (/_next/static/*) is already
 *     content-hashed and serves immutable, so we don't override.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['postgres'],
  async headers() {
    return [
      {
        // Match every icon variant Next can route, plus the maskable SVG.
        // The /apple-icon and /icon paths (no extension) are App Router
        // metadata routes — Next renders them at the bare path.
        source: '/:path(icon-512\\.png|icon-maskable\\.svg|favicon\\.ico|apple-icon|icon)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=3600' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/api/sessions/upcoming',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=10, s-maxage=10, stale-while-revalidate=30',
          },
        ],
      },
      {
        source: '/api/sessions/past',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=10, s-maxage=10, stale-while-revalidate=30',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
