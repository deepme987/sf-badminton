# SF Badminton

You're working in a small Next.js app for a ~90-person SF badminton group.
It exists to replace WhatsApp polls — single source of truth for who's
playing this week.

## What's where

| Layer | Lives in |
|---|---|
| Pages + UI | `app/` (App Router) |
| Reusable components | `app/_components/` |
| API route handlers | `app/api/` |
| Service layer (business logic) | `lib/services/` |
| Drizzle schema | `lib/db/schema.ts` |
| Client helpers (api, identity, theme, push, realtime) | `lib/client/` |
| Shared types | `lib/services/types.ts` |
| zod request schemas | `lib/api/schemas.ts` |
| Auth helpers + rate limit | `lib/api/http.ts`, `lib/api/rate-limit.ts` |
| Service worker | `public/sw.js` |
| OG images | `app/opengraph-image.tsx`, `app/og/sessions/[id]/route.tsx` |
| Cron handlers | `app/api/cron/*` |
| Tests | `tests/` (Vitest) + `tests-e2e/` (Playwright) |

## Stack

- Next.js 15 (App Router) + TypeScript strict
- Tailwind 4 + Inter, Sheet design tokens in `app/globals.css`
- Drizzle ORM → Supabase Postgres (server-side, secret key)
- `@supabase/supabase-js` (client-side, publishable key) — Realtime
- `web-push` for PWA push notifications (VAPID)
- Vercel: Analytics, Cron, deploy target

## Conventions

- **No `any`.** TypeScript strict (`strict`, `noUncheckedIndexedAccess`).
  Use `unknown` + narrowing or define real types.
- **No new deps without need.** This is a side project. The bar is high.
- **No mention of AI, Claude, GPT, or generative tooling** in commits, PR
  descriptions, code comments, or anything user-facing.
- **Sheet design only.** Cream `#FAFAFA`, ink `#171717`, emerald `#059669`,
  Inter, tabular numbers. Don't reskin.
- **Conventional commits.** `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- **Branches**: `<username>/<short-description>`.
- **KISS.** If a feature doesn't measurably help the 90-person group,
  don't ship it.

## Locked product decisions

From `PLAN.md` — not up for debate without an issue first:

- Identity is per-device. UUID + display name in localStorage. No accounts.
- FCFS strict — drop + rejoin sends you to the back of the queue (new slot row).
- Court capacity clamped 4-6.
- Venues: Shuttl (≤4 courts), OneA (=1 court), Other (uncapped).
- Creator OR slot owner can drop. Past sessions are fully read-only.
- Light mode default. Dark mode available via the Profile picker.
- Two notification types: new session, 4-hour reminder. No granular prefs.

## Common commands

| | |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run typecheck` | TypeScript strict, `--noEmit` |
| `npm run lint` | ESLint, 0 warnings allowed |
| `npm test` | Vitest (needs DATABASE_URL — **wipes `sessions` table, NEVER point at prod**) |
| `npm run test:e2e` | Playwright (needs Supabase + dev server) |
| `npm run test:e2e:headed` | Same, watch the browser |
| `npm run build` | Production build (will clobber `next dev`'s `.next`) |

## How the data flows

1. UI reads from server components which call services directly
   (no HTTP round-trip).
2. UI writes go through `lib/client/api.ts` → REST routes in `app/api/` →
   `lib/services/sessions.ts`. The service layer wraps writes in a
   transaction, enforces creator-or-self auth, and emits an `events` row.
3. Client subscribes to Supabase Realtime on the session detail page —
   debounced 200ms refetches on any change. No polling.
4. Push notifications fire from `/api/sessions` (new session) and
   `/api/cron/reminders` (4-hour reminder, hourly cron).

## Things to NOT touch without discussion

- The Sheet design tokens (`app/globals.css`)
- The FCFS rejoin rule or auto-promote logic (`lib/services/sessions.ts`)
- Schema migrations — apply via Supabase MCP, NEVER edit via `drizzle-kit push`
- The service worker cache strategy (`public/sw.js`)
- Push notification payloads — they're versioned by SW handler
- The CI workflow's "Vitest is intentionally not run in CI" comment.
  `tests/_helpers.ts` wipes the `sessions` table in `beforeEach`. Running
  Vitest against prod (or any shared DB) deletes every session. Re-enabling
  requires a dedicated test Supabase project first.

## When you're done

- `npm run typecheck && npm run lint && npm test && npm run test:e2e`
  all green before opening a PR
- Conventional commit
- Open as draft, request review from @deepme987
- See `CONTRIBUTING.md` for full PR process
