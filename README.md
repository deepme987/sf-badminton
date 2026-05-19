# SF Badminton

A single source of truth for who is playing this week.

Our SF badminton group has ~90 people and growing. WhatsApp polls were
breaking down: confirmed/waitlist confusion, +1s invisible, drop-outs not
propagating, multiple polls colliding in the chat. SF Badminton fixes
that. Create a session, share the link, watch the roster fill up.

## What it does

- **Sessions** — pick a date, time, venue, and number of courts.
  Anyone with the link can join.
- **First-come, first-served** — when a court fills, the next person
  lands on a waitlist. Drop and rejoin sends you to the back of the
  line, not back to your old spot.
- **+1s** — bring a guest. Their name goes on the roster and they take
  their own slot against capacity.
- **Auto-promotion** — when a confirmed player drops, the top of the
  waitlist moves up automatically. Show up at the court; the roster is
  always correct.
- **Creator powers** — whoever made the session can drop anyone (cleanup
  is the lead's job). Everyone else can only drop themselves.
- **Per-device identity** — just a display name, stored in
  `localStorage`. No accounts, no emails, no phone numbers.
- **Light + dark theme** — light is the default. Switch in Profile.
- **Installable PWA** — add to home screen on iOS and Android. Tabs +
  share previews look like a real app.
- **Rich link previews** — paste a session URL in WhatsApp or iMessage
  and you'll see the venue, time, and live spots-remaining count.

## Stack

- [Next.js 15](https://nextjs.org/) (App Router) + TypeScript strict
- [Tailwind 4](https://tailwindcss.com/) + Inter
- [Drizzle ORM](https://orm.drizzle.team/) + [Supabase](https://supabase.com/) Postgres
- [`@vercel/og`](https://vercel.com/docs/functions/og-image-generation)
  edge function for dynamic OG card images
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/)
  for unit and e2e tests (36 + 34 = 70 tests today)

## Running locally

```bash
git clone git@github.com:deepme987/sf-badminton.git
cd sf-badminton
npm install
cp .env.example .env.local         # fill in your Supabase keys
npm run dev                        # http://localhost:3000
```

If this is a fresh Supabase project, apply the schema via the Supabase
SQL editor (the `sessions`, `courts`, `slots`, `events` tables — see
`lib/db/schema.ts` for the exact shape).

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Start dev server on `:3000` |
| `npm run build` | Production build |
| `npm run lint` | ESLint (0 warnings allowed) |
| `npm run typecheck` | TypeScript strict mode, `--noEmit` |
| `npm test` | Vitest unit suite (36 tests) |
| `npm run test:e2e` | Playwright headless (34 tests, desktop + mobile chromium) |
| `npm run test:e2e:headed` | Same, watch the browser |
| `npm run test:e2e:ui` | Playwright trace-viewer mode |

## Deploying

Cleanest path is via Vercel's GitHub integration.

1. **Connect the repo**
   - Go to [vercel.com/new](https://vercel.com/new) and import `deepme987/sf-badminton`.
   - Framework should auto-detect as **Next.js**. Don't override.

2. **Add environment variables** (Project Settings → Environment Variables, scope = Production + Preview + Development):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-us-west-2.pooler.supabase.com:6543/postgres
   ```

   See [`.env.example`](./.env.example) for what each value does.

3. **Deploy.** Vercel auto-detects Next.js, runs `npm run build`, and publishes to `https://sf-badminton-<hash>.vercel.app` (or your custom domain if you set one).

4. **Confirm the OG image works**: paste your production URL in WhatsApp or iMessage; the link preview should render the SFB logo + the "Who is playing this week" tagline.

For a custom domain, point a DNS A/CNAME record at Vercel per [their docs](https://vercel.com/docs/projects/domains/add-a-domain).

## Project layout

```
app/
  api/                # Route Handlers — sessions, courts, slots, plus-one
  _components/        # React components (AppBar, BottomBar, SlotRow, etc.)
  og/sessions/[id]/   # @vercel/og dynamic session OG images
  opengraph-image.tsx # Home OG (shown when someone shares the app URL)
  globals.css         # Tailwind 4 tokens + Sheet design system
  layout.tsx, page.tsx

lib/
  db/                 # Drizzle schema + Supabase Postgres client
  services/           # Pure business logic (joins, drops, promotions)
  api/                # zod request schemas + HTTP helpers
  client/             # Client-only helpers (identity, theme, api, clipboard)
  venues.ts errors.ts ids.ts

tests/                # Vitest service-layer + lib tests
tests-e2e/            # Playwright user-flow tests
public/               # Manifest, icons, OG static assets
```

## Design decisions worth knowing

See [`PLAN.md`](./PLAN.md) for the full set. The big ones:

- Identity is **per-device**, not per-user. A device is a UUID in
  localStorage with a display name. Switching phones gets you a new
  identity unless you re-enter the same name.
- FCFS is **strict by rejoin**: dropping and rejoining puts you at the
  back of the queue. No "I dropped to free a spot for X" gaming.
- Courts are first-class. Sessions own courts; courts own confirmed
  slots; the session owns the waitlist. Auto-promotion bridges the two.
- Venue caps: Shuttl ≤ 4 courts, OneA = 1 court, Other unlimited.
- Capacity caps: 4–6 per court.

## License

MIT. See [LICENSE](./LICENSE).
