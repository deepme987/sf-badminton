# Contributing to SF Badminton

Thanks for poking at this. SFB is a small app for a small group — contributions
welcome, but we keep it intentionally simple. KISS.

## Before you write code

Open an issue first. Random feature drops or "nice to have" PRs are likely
to get politely closed. We'd rather discuss the scope up front.

## Setup

```bash
git clone git@github.com:deepme987/sf-badminton.git
cd sf-badminton
npm install --legacy-peer-deps
cp .env.example .env.local        # fill in your own Supabase + VAPID
npm run dev                       # http://localhost:3000
```

You'll need your own Supabase project (free tier) and a VAPID keypair
(generate with `npx web-push generate-vapid-keys`). The `.env.example`
file documents every variable.

## Workflow

1. **Fork** the repo and clone your fork.
2. **Branch** off `main`: `<your-username>/<short-description>` (e.g.
   `jane/fix-mobile-time-picker`).
3. Make your change. Conventional commits (`feat:`, `fix:`, `chore:`, etc).
4. Run the gate locally:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run test:e2e
   ```
   All four must pass.
5. **Open a PR as a draft.** Fill in the PR template — it's short.
6. Flip to ready once CI is green. @deepme987 reviews.

## What we will not merge

- New runtime dependencies without a clear, narrow need.
- New visual themes / brand colors. Sheet is the design.
- Features that "make it more like \<other app\>" — we are intentionally simple.
- PRs that mention AI, Claude, GPT, or generative tooling anywhere.
- PRs that introduce `any`, skip TypeScript strict, or weaken lint rules.
- PRs that break the FCFS rejoin rule, capacity clamps, or creator-or-self
  drop auth. These are load-bearing product decisions.

## What we will merge fast

- Bug fixes for the 90-person group's actual reported pain.
- Accessibility improvements.
- Performance wins that don't change UX.
- Tests for behavior that's only manually verified today.
- Copy fixes, typo fixes, doc fixes.

## Code conventions

See `CLAUDE.md` for the full rundown. Highlights:

- TypeScript strict; no `any`, no `@ts-ignore`.
- ESLint with 0 warnings allowed.
- Mobile-first responsive (Tailwind `md:` / `lg:` only for desktop polish).
- Service-layer business logic in `lib/services/`, route handlers stay thin.
- Conventional commits.

## Tests

- `npm test` — Vitest unit suite (36 tests). Covers FCFS, rejoin-to-back,
  auto-promote, creator-or-self auth, capacity bounds, venue caps, +1
  rules, rate limit, clipboard fallback.
- `npm run test:e2e` — Playwright (42 tests on Chromium desktop + mobile).
  Covers full lifecycle (create → join → +1 → drop → rejoin), chrome,
  identity, waitlist, past-session read-only.

### ⚠️ Vitest is local-only, NEVER point it at prod

The unit suite calls `db.delete(sessions)` in every test's `beforeEach`
to guarantee an isolated table state. **If `DATABASE_URL` points at a
shared Supabase project, every `npm test` run wipes every session in
that project.**

For this reason `npm test` is **not** wired into CI today — CI runs
`typecheck`, `lint`, and `build` only. Spin up your own Supabase free-tier
project for local Vitest runs and point your `.env.local` `DATABASE_URL`
at it.

If you want CI to run Vitest, create a second Supabase project just for
tests and add its `DATABASE_URL` + `SUPABASE_SECRET_KEY` as repo secrets,
then uncomment the `Vitest` step in `.github/workflows/ci.yml`.

Playwright is safer — every test creates its own session and deletes
just that session in `afterAll`. No table-wide resets. Still, prefer a
dev DB locally.

## Reporting bugs

Open a GitHub issue. Include:
- What you tried
- What you expected
- What actually happened
- Browser / OS / mobile vs desktop
- Console / network errors if any

## License

MIT. See `LICENSE`. By contributing you agree your code is MIT-licensed
under the project.
