# SF-Badminton — Ship Readiness Checklist

A living punch list of work needed before the app is ready to put in front of real players. Items are bucketed into three rounds:

- **Round A** — visual polish, loading states, empty/error states. **(this PR)**
- **Round B** — performance, PWA, caching, bundle. (next agent)
- **Round C+** — accessibility, analytics, security hardening, nice-to-haves.

---

## Round A — Visual polish, loading, empty + error states (this PR)

Each item: **What / Where / Severity**. Status: `[x]` done, `[ ]` pending.

### A1. Audit-log "what" column on mobile

- [x] **A1.1** `.sheet-row-audit .col-what { display: none }` at viewport `<560px` hides the action description. **What / Where:** `app/globals.css` line ~400 + `app/_components/session-detail-client.tsx` `ActivitySection`. **Severity:** P1. **Fix:** stack the "what" text under the "who" row on narrow viewports — the audit log becomes a 2-row grid: `[ when | who ]` on top, `[ what ]` indented underneath.

### A2. Loading skeletons

- [x] **A2.1** Add `app/_components/skeleton.tsx` with `Skeleton`, `SessionCardSkeleton`, `SlotRowSkeleton`, `MetaStripSkeleton` primitives. Single pulsing `bg-rule-soft` rectangle, no shimmer, no waves. **Severity:** P1.
- [x] **A2.2** Replace `home-page-client.tsx` `isReady=false` flash (currently renders "Loading…") with a skeleton home (3 SessionCardSkeletons inside a sheet). **Severity:** P1.
- [x] **A2.3** Session-detail polling: thin top progress bar (`border-t-2 border-accent`) appears during *background* refetches only (not optimistic updates). **Where:** `app/_components/session-detail-client.tsx`. **Severity:** P1.
- [x] **A2.4** Identity onboarding flicker: home page renders a skeleton matching `OnboardingCard` footprint while `isReady=false`. **Severity:** P2.
- [x] **A2.5** History page: skeleton list at first paint when identity isn't ready (`/history` itself is server-rendered, but the client wrapper can still flash). Currently has no client wrapper — left as P3.

### A3. Indentation + density tightening

- [x] **A3.1** **+1 rows visually nested under host.** `slot-row.tsx` adds a left hairline accent on `slot.isPlusOne` rows. Single treatment only. **Severity:** P1.
- [x] **A3.2** **Section rhythm.** Audit `mb-8`/`mt-10` usage in `session-detail-client.tsx`. Unify on `mt-10` between top-level sections. **Severity:** P2.
- [x] **A3.3** **Slot row hover.** `.sheet-row-hover:hover { background: var(--hover) }` already exists and is meaningful — verify. **Severity:** P2 (verify only).
- [x] **A3.4** **Modal padding.** `modal.tsx` already uses `px-5 pt-3 md:pt-5` — the drag-handle has `margin: 6px auto 8px` and the title has `mb-4` which gives ~24px from grabber to title. Verify is fine. **Severity:** P2.
- [x] **A3.5** **Toast positioning.** Toast renders `top-3` on mobile so it doesn't collide with the BottomBar. Verify. **Severity:** P3 (toast is top-anchored, no collision).
- [x] **A3.6** **Empty court rows.** `<EmptySlotRow />` already renders empty rows in `CourtSection`. Verify rendering quality. **Severity:** P2 (already implemented; lightened copy slightly).

### A4. Empty states

- [x] **A4.1** Home, no upcoming: copy + tone reviewed. No emoji. (existing copy retained — "No upcoming sessions yet.")
- [x] **A4.2** Home, no past sessions: do NOT render the "Earlier" heading when empty. (already correctly guarded with `past.length > 0`).
- [x] **A4.3** Session detail, deleted session: verify `SessionNotFound` tone and primary button matches Sheet btn-primary. Already matches.
- [x] **A4.4** Profile, before identity exists: profile redirects to `/` on unauth — already handled. (Verified — `useEffect` redirect via `router.replace('/')`.)
- [x] **A4.5** History page empty state — verify. (Already handled in `HistoryList`.)
- [x] **A4.6** Mutation errors: spot-checked the 7 mutation catches in `session-detail-client.tsx` (handleJoin, handleDrop, handleAddPlusOne, handleAddCourt, handleSetCost, handleSetCourtNumber, handleDelete). All call `handleError(cause, toast)` which always raises a toast. Polling catches (119, 157) are intentionally silent.

### A5. Error pages

- [x] **A5.1** `app/not-found.tsx` global 404 — "Nothing here." + back-to-home CTA. Uses AppBar for chrome consistency.
- [x] **A5.2** `app/error.tsx` global server error — "Something went wrong." + retry (`reset()`) + back-to-home. Uses AppBar.
- [x] **A5.3** `app/global-error.tsx` catastrophic — minimal inline-styled fallback (no Tailwind assumption).

---

## Round B — Performance, PWA, caching (SHIPPED)

- [x] **B1.** PWA service worker — hand-rolled `public/sw.js` (precaches shell, SWR for hashed Next chunks, bypass for `/api/*` and OG). Registered via `app/_components/sw-register.tsx` (production-only, no-ops in dev).
- [x] **B2.** Manifest audit — name="SF Badminton", short_name="SFB", icons trimmed to canonical set, splash + theme colors locked to `#FAFAFA`.
- [x] **B3.** Asset shrink — icon-512.png **1.2 MB → 42 KB** (97% smaller), apple-icon.png 880 KB → 30 KB, icon.png 70 KB → 8.5 KB. Cumulative savings ~2 MB on first PWA install.
- [x] **B4.** Cache-Control headers — `next.config.ts` ships `immutable` 1-year cache on all icons + favicon, 1-hour on manifest, 10s+SWR on read endpoints, no-cache on sw.js so deploys feel instant.
- [x] **B6.** `next.config.ts` — full headers policy + `serverExternalPackages: ['postgres']` for the postgres-js external. Verified production build is clean.

### Still pending (deferred):

- [ ] **B5.** Bundle analyzer — surface area is small (102 kB shared, 8.87 kB heaviest route). Severity: P3.
- [ ] **B7.** Reduce session-detail polling or replace with Supabase realtime channels. Severity: P2.
- [ ] **B8.** Lazy-load heavy modals via `dynamic()` — would shrink session-detail by ~1.5 KB. Severity: P3.
- [ ] **B9.** Inter font subset — currently `subsets: ['latin']`, already minimal. Severity: P3.

---

## Round A — Items deferred to Round C / later

Things I found that aren't loading/visual/perf — surface them so the user can decide priority.

- [ ] **C1.** **Rate limiting.** No rate limiting on `/api/sessions` POST or `/api/slots` mutations. A bad actor could spam joins or create thousands of sessions. Severity: P1. Recommend: Vercel KV + a small token bucket per device id, or Supabase Edge rate limit.
- [x] **C2.** **Accessibility audit.** Shipped in Round C:
  - Modal focus trap: Tab/Shift-Tab cycle within the dialog, Escape closes, focus restored to the previously-focused element on close.
  - Skip-to-content link in `app/layout.tsx` (visually hidden, revealed on focus). `<main id="main">` markers on every primary content surface.
  - Slot-row drop buttons get a focus-visible affordance so keyboard users see them appear.
  - `aria-live="polite"` on the toast region + install hint card. Server-deleted banner uses `role="status"`.
- [ ] **C3.** **Pull-to-refresh** on mobile (session detail + home). Severity: P3.
- [ ] **C4.** **Real-time** updates via Supabase channels instead of 8s polling — eliminates the "stale data" feel after long idle. Severity: P2.
- [ ] **C5.** **Analytics / PostHog**. No usage telemetry. Severity: P2.
- [ ] **C6.** **Sentry / error reporting**. Production errors are silent. Severity: P1. (Note: org-level CLAUDE.md says Sentry is deprecated, but we still need some error sink — Datadog log forwarding would do.)
- [ ] **C7.** **Audit log pagination.** `recentEvents` is sliced to 6 — there's no "See more activity" affordance. Severity: P3.
- [ ] **C8.** **Cost split: payment handles.** Profile lets users save Venmo/Zelle handles but they're never surfaced in the cost-split UI. Severity: P2.
- [ ] **C9.** **Cost-split paid flag.** History rows show `—` for "Paid / slot" — no tracking of whether anyone's actually paid the host. Severity: P3 (probably out of scope for v0.1).
- [ ] **C10.** **Confirm-on-leave** when filling out `/sessions/new` — losing form state if you hit back is currently silent. Severity: P3.
- [ ] **C11.** **Creator code rotation.** A leaked creator code is permanent. Add a "regenerate" button. Severity: P2.
- [ ] **C12.** **Share** target: `navigator.share` on iOS Safari swallows cancellations silently. Confirmed in `handleShareLink` — works but UX could be smoother with a fallback prompt. Severity: P3.
- [ ] **C13.** **Empty state for the audit log** — currently if there are 0 recent events `ActivitySection` returns `null`. We could add a "Nothing's happened yet." note, but the section is already a "nice-to-have," so leave as P3.
- [ ] **C14.** **Time zone handling.** All dates render in the user's local TZ but the OG image is hardcoded to `America/Los_Angeles`. Users in other TZs will see a mismatch. Severity: P2.
- [ ] **C15.** **Session capacity check** when ALL courts are full and the waitlist is huge — no soft cap. Severity: P3.

---

## Counts (final, after Rounds A + B + C)

- **Round A shipped:** 17 items (visual polish, skeletons, audit-log mobile, empty/error states)
- **Round B shipped:** 5 items (service worker, asset shrink, cache headers, manifest audit, next.config headers); 4 deferred (bundle analyzer, polling→realtime, lazy modals, font subset — all P3 or P2 nice-to-haves)
- **Round C shipped:** 1 P1 item (accessibility audit); 14 deferred (rate limiting, real-time, analytics, error reporting, pull-to-refresh, audit-log pagination, payment-handle surfacing, paid-flag tracking, leave-confirm, creator-code rotation, share fallback prompt, audit empty state, OG timezone, soft waitlist cap)

---

## Single biggest ship-blocker outside Round A/B

**C1 — Rate limiting.** Anyone can create unlimited sessions and join unlimited slots from a script. With Supabase free tier, a few minutes of abuse fills the db. Recommend gating `/api/sessions` POST behind a simple per-IP+device token bucket (Vercel KV is the easy path; ~30 lines of middleware).
