# SF Badminton — Initial Plan

Status: **draft, for review**. Not a commitment. Goal here is alignment before code.

---

## The actual problem (from the WhatsApp thread)

The group works fine when it's small. It breaks when it's hot. From the chat:

- **Polls overflow silently.** 11 people vote, max is 6 per court, the 7th–11th think they're in. Someone has to manually call out "you, you, you are confirmed, the rest are waitlist."
- **Waitlist is improvised.** People literally use "option 2" of the WhatsApp poll as the waitlist. New folks can't tell the difference between a real option and a waitlist hack.
- **+1s (guests) are invisible.** Tanima has a +1. Ankit has a +1. Sometimes Nidhi votes "as a plus one for someone." The poll has no concept of this, so people count manually in chat.
- **Drop-outs don't propagate.** Astha drops at 10am, Venkat drops at 11am. Then 30 messages later someone says "wait, who's confirmed?" and Dakshi has to write out a numbered list.
- **Multiple polls collide.** Friday poll + Monday poll + a "weekday preference" poll all running at once, all stacked in the same chat. Polls scroll out of view.
- **New members are lost.** Jainee joined recently. She had to ask what Shuttl is, whether she's confirmed, what time it's at, and whether to bring a racket — each one a separate roundtrip.
- **Court booking is an out-of-band lead.** Someone has to actually go to Shuttl's site and book courts based on the poll count, then announce court numbers in chat.
- **Cost split is end-of-night manual.** "$14.40, Venmo me." That part is fine but lives in chat too.

The shared thread: **WhatsApp polls have no concept of state.** They're a vote, not a ledger.

What the app needs to be is a **single source of truth for "who is playing on Friday."**

---

## What we are not building

- Not a payment app. Venmo / Zelle stays as-is. We can display the per-person split, that's it.
- Not an account system. No email, no password, no login wall. Name + per-device identity, full stop.
- Not a court-booking integration. Shuttl doesn't have a public API and we're not screen-scraping. The "lead" still books — the app just makes the count and waitlist legible.
- Not a notifications platform in v1. WhatsApp is already the notification channel. The app is the structured layer underneath.
- Not analytics. We are explicitly **not** collecting data beyond what's needed to run a session (names + votes + drop times). No emails, no phone numbers, no location.
- Not a generalized "sports group" tool. It's for this specific use case. If it works we generalize later.

---

## Core concepts

Four nouns:

1. **Session** — a play occasion. A specific date + time + location. No capacity of its own; capacity is the sum of its courts.
2. **Court** — a booking inside a session. Has a `label` ("Court 1") and optionally a real-world `number` filled in by the lead after they book at Shuttl ("2", "3"). Has a `capacity` (default 6). A session can have 1+ courts. Courts can be added mid-flight (real behavior: "we got 4 more people, booking another court").
3. **Slot** — one person's claim. Either a member's slot or a member's `+1` slot (with guest's name). State is `confirmed` (lives on a specific court) or `waitlist` (lives on the session, court-less). FCFS order.
4. **Person** — name + per-device UUID. No account. Whoever you typed in on first visit.

**How waitlist + courts interact:**
- Waitlist is **session-level**, not court-level. A single queue.
- When *any* confirmed slot drops, top of the session waitlist auto-promotes into that newly-empty court spot.
- This matches reality: people don't queue for "Court 1 specifically." They queue for the night.

**Important**: creating a session does **not** auto-join you. Leads often book courts for others without playing themselves (this is real behavior in the group).

That's the whole model.

---

## Key flows

### 1. Lead creates a session
- Tap "+ New Session"
- Pick date, start time, end time
- Pick location (default Shuttl; freeform fallback)
- Start with **1 court** (capacity 6 by default). The lead can add more courts at create time or later.
- Tap create. Get a short URL like `vibebad.app/s/k4p9` + a one-time **creator code** to save for reclaiming on another device.
- **Lead is NOT auto-added.** If they want to play, they tap "I'm in" like anyone else.
- Paste URL in WhatsApp group. WhatsApp renders a rich OG card with date/time/location/spots-left.

### 1b. Lead adds a court mid-flight
- On the session, tap "+ Add court"
- New court appears with capacity 6 (editable). The top 6 of the waitlist auto-promote into it.
- This is the common "Varsha booked Court 2 and 3 since 8 people voted" pattern, made explicit.

### 1c. Lead fills in court numbers after real-world booking
- Each court has a `Booked as:` field (freeform, e.g. "Court 2", "Court 3")
- Shows up at top of the court roster so people know where to meet

### 2. Member joins
- Open URL → see the session card with courts side-by-side
- First time: type your name. Saved in localStorage with a UUID.
- Tap "I'm in" → auto-assigned to the first court with room (lower position fills first), else to session waitlist (with visible queue position)
- Optionally tap "+1" → **prompted for guest's name** (required) → +1 takes its own slot against the same court (or the next court with room)

### 3. Drop out
- **You can drop yourself anytime.** Drop button on your own slot.
- **The session creator can drop anyone.** Drop buttons appear on every slot only when you're the creator.
- Everyone else: no drop buttons on other people's slots.
- When a confirmed slot drops: **top of waitlist auto-promotes**. Banner on the session: "Megha is now confirmed (promoted from waitlist)."
- When a waitlist slot drops: everyone behind shifts up.
- All drops show up in the audit log regardless of who initiated.

**FCFS, strictly enforced (the rejoin rule):**
- Order is purely "time of latest join action," not "time of first join action."
- If you join → drop → rejoin, you go to the **back of the line**, not back to your old position.
- Same applies to +1s. If Ankit drops his +1 and adds them back, they're now at the back.
- This prevents the "I'm dropping and re-adding to free up my spot for X, but I still want my own spot" hack, and keeps the queue fair.
- Implementation: on rejoin, a new `slots` row is created with `position = max(position) + 1` within the target queue. The old dropped row stays in the events log but is not reactivated.

### 4. Lead checks who's coming
- One screen: confirmed list (numbered 1–N), waitlist (numbered W1–WN), drop-outs (greyed, with timestamps), +1s shown with owner.
- "Copy roster" button → formatted text for pasting in chat.
- Audit log shows last 10 changes ("Astha dropped 2h ago", "Nidhi added +1 5m ago").

### 5. Lead books courts and posts the number
- One field on the session: "Court(s) booked: ___"
- Whoever has the lead types in court numbers. Shows up at top of session view.

### 6. End of night
- Lead types in total $ paid for courts
- App divides by **slot count, not person count** — so a member with a +1 pays 2 shares (e.g. 4 solo + 2 with +1s = 6 slots, total / 6, +1-owners pay × 2)
- Static Venmo / Zelle handles can be saved per-person in their profile (optional)

### 7. Member browses upcoming
- Home screen: list of upcoming sessions, sorted by date
- Each row shows: date/time, location, "5/6 confirmed, 2 on waitlist", your status badge ("you're in" / "you're #2 on waitlist" / not voted)

---

## Screens (rough)

1. **Home** — list of upcoming sessions + button to create new
2. **Session detail** — the centerpiece. Roster, waitlist, +1s, drop-out, court info, cost split
3. **Create session** — modal-ish form
4. **Profile** — your display name + (optional) Venmo/Zelle handle to show to others
5. **History** — past sessions, who played, what people paid (so the "regulars" become visible naturally)

That's it. Five screens. Anything more is scope creep for v1.

---

## Identity model (the slightly tricky part)

No accounts. So how do we know "you" are "you"?

- On first visit: prompt for a display name. Store `{ id: uuid(), name }` in localStorage.
- Every action sends the device's UUID with the request.
- **Drop permissions:**
  - **You** can drop your own slot (and any +1s you added).
  - **The session creator** can drop anyone on the session. Their device UUID is stamped on the session at create time.
  - **Everyone else**: no power to drop other people. They see the roster, no buttons next to others.
- Switching devices: type your name again on the new device, it makes a new UUID. For the **session creator** this matters more — they lose creator powers when they switch devices. Mitigation: at create time, show a one-time **"creator code"** (short, memorable, like `k4p9-megha`) that they can paste on a new device to reclaim creator rights. Optional, only matters if they actually need to drop someone from a second device.
- Display names are not unique. "Megha" and "Megha S." can coexist.

This is the right level of structure for a casual group: self-service for normal cases, lead-only for cleanup, audit log for accountability.

---

## Tech stack

Free, minimal ops, no servers to babysit.

| Layer | Pick | Why |
|---|---|---|
| Frontend | **Next.js 15 + Tailwind 4** | PWA-ready, fast, matches what the agent-office stack already knows |
| Mobile feel | **PWA** with install prompt + offline shell | iOS + Android, no app store |
| Backend | **Supabase** (free tier) | Hosted Postgres + Realtime + REST. No server code in v1. |
| Realtime | **Supabase Realtime channels** | Roster updates live without polling |
| Hosting | **Vercel** (free tier) | Push to deploy, free TLS, edge cache |
| Link previews | **`@vercel/og`** edge function | Dynamic OG image per session: date, time, location, "5/6 confirmed · 2 on waitlist". Rich card in WhatsApp / iMessage. |
| Identity | **localStorage UUID + display name** | No auth provider needed |
| Auth at API layer | **Next.js Route Handlers** + Supabase service role key | We enforce "creator-or-self" drop rules in our own handler code, not RLS. Simpler than wiring custom JWT claims into Supabase. |
| Domain | Skip — ship at `*.vercel.app` |

**Alternatives we considered:**
- *Firebase instead of Supabase*: works, but Supabase's SQL + free tier ergonomics are better for us. Either is fine.
- *No backend at all (just a Google Sheet)*: tempting but the realtime story is bad and the security model is "nothing."
- *Native iOS/Android*: hard no. PWA is enough for this use case and costs nothing.

---

## Data model (Supabase, sketch)

```sql
sessions (
  id text primary key,            -- short slug like "k4p9"
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  total_cost_cents int,
  creator_device_id uuid,
  creator_code text,              -- short token shown once; lets creator reclaim on a new device
  created_at timestamptz
)

courts (
  id uuid primary key,
  session_id text references sessions on delete cascade,
  label text,                     -- "Court 1" — internal label, auto-assigned
  booked_as text,                 -- "Court 2" / "Court 3" — real-world number, filled by lead
  capacity int default 6,
  position int,                   -- order within session (1, 2, 3...)
  created_at timestamptz
)

slots (
  id uuid primary key,
  session_id text references sessions on delete cascade,
  court_id uuid references courts on delete set null,   -- null = on session waitlist
  device_id uuid,                                       -- the device that added this slot
  display_name text,                                    -- always populated (the person or the +1)
  is_plus_one boolean default false,
  plus_one_of uuid references slots,
  state text check (state in ('confirmed','waitlist','dropped')),
  position int,                                         -- order within (court, state) or (session, waitlist)
  created_at timestamptz,
  updated_at timestamptz
)

events (
  id uuid primary key,
  session_id text references sessions on delete cascade,
  device_id uuid,
  action text,                    -- 'create_session','add_court','join','drop','add_plus_one','set_court_number','rename', etc
  payload jsonb,
  created_at timestamptz
)
```

No users table — identity lives client-side. `events` powers the audit log.

**Invariants we enforce in API handlers:**
- A `confirmed` slot must have a non-null `court_id`. A `waitlist` slot must have a null `court_id`.
- Sum of confirmed slots per court ≤ that court's `capacity`.
- Promotion is automatic: on any confirmed-slot drop, top waitlist slot (by `position`) gets the freed court_id and state flips to `confirmed`.
- Drop authorization: caller's `device_id` must match either the slot's `device_id` (self) or the session's `creator_device_id` (lead).

---

## Phased rollout

**Phase 1 — MVP (target: this weekend)**
- Home + Session detail + Create session
- Confirmed / Waitlist / Drop-out auto-promote
- +1 support
- Share link
- That's it. Post in WhatsApp. See what breaks.

**Phase 2 — quality-of-life**
- Court # field, cost split, copy-roster button, audit log
- "Regulars" view (people who've played 3+ times)
- Profile page with Venmo / Zelle handles

**Phase 3 — based on real use**
- Recurring sessions (weekly Mondays etc)
- Day-of reminders (web push if Phase 1 stickiness is there; otherwise skip)
- Stats ("you've played 12 times this quarter")

**Phase 4 — only if asked**
- Multiple groups (so other crews can use it)
- Custom domain
- Anything else the group actually requests

---

## How we'd build this with the agent-office agents

- `designer` → pixel-tight markdown specs for the 5 screens + state diagrams
- `design-engineer` → clickable HTML prototype so we sanity-check the flow before any Next.js
- `frontend-engineer` → Next.js + Tailwind + Supabase client
- `backend-engineer` → Supabase schema, RLS policies, migrations
- `qa-engineer` → smoke tests for FCFS / waitlist promotion edge cases (the easy place to introduce bugs)

To use them from this repo, we'd either symlink `.claude/agents/` from agent-office, or copy in the specific agents this project needs.

---

## Decisions confirmed (2026-05-18)

1. **Drop permissions:** creator-or-self only. No "anyone can drop anyone." Audit log still public.
2. **+1s** count against capacity, each is its own slot, **name required** when adding.
3. **Courts modeled separately** as first-class entities. Single session-level waitlist promotes into any freed court spot.
4. **Creator is NOT auto-joined.** They tap "I'm in" themselves if they're playing.
5. **Cost split = total / slot_count.** Members with +1s pay 2 shares.
6. **No custom domain.** Ship at `*.vercel.app`.
7. **OG link previews via `@vercel/og`** edge function. Render date/time/location/spots-remaining into the image so WhatsApp shows a rich card.
8. **FCFS rejoin rule**: drop + rejoin sends you to the back of the queue, not your old position.
9. **Court capacity is clamped 4–6.** Default 6. Hard max 6 because (a) most Shuttl courts don't allow 8, and (b) above 6 the active-to-waiting ratio gets bad (8 = 4 playing + 4 sitting). Hard min 4 because below that it's effectively a private booking, not a group session.
10. **Lowering capacity below current confirmed count** is refused with a friendly error toast ("Drop people first if you need to shrink"). Not auto-demote to waitlist.
11. **Creator code banner self-dismisses** after first view. Reachable later via Edit session > Reveal creator code.
12. **Venue is a preset dropdown**, not freeform text. Known venues are hardcoded in the frontend with a `maxCourts` constraint:
    - `Shuttl` — up to 4 courts
    - `OneA` — 1 court only
    - `Other` — reveals a freeform name input; no court cap

    The selected venue (or the typed "Other" name) is stored on the session as plain text. We don't need a venues table — the list is short and is part of the frontend bundle. Last-selected venue is remembered in localStorage and prefilled on next session create.
13. **+1 host device-change** is an accepted limitation — host can't drop their own +1 from a new device, but the session creator still can. No special UI.
14. **Storage = Supabase (hosted Postgres, free tier).** All session/court/slot/event data lives there. Vercel is hosting only — it runs the Next.js app, edge OG image, and serves static assets. It does **not** persist app state. localStorage handles client-side identity (device UUID, display name, theme, last-venue) and never leaves the device.

## Next step

Now that the model is locked, the sensible move is to spin up two agents in parallel:

- **`designer`** → write tight screen-by-screen specs under `docs/design/` (Home, Session detail with multi-court layout, Create session, +1 dialog, Profile, History). Mobile-first ASCII wireframes. Define empty / loading / error states.
- **`design-engineer`** → consume those specs and ship a clickable HTML prototype under `docs/design/html-v1/` with mock data (the real WhatsApp roster as fixtures, so the screens look populated and realistic). No Vue, no build step, just HTML + Tailwind via CDN.

We'd review the prototype in a browser, iterate on flow, *then* hand to `frontend-engineer` + `backend-engineer` for the real Next.js + Supabase build.

Say the word and I'll kick those two off in parallel.
