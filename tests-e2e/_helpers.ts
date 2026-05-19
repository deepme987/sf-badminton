/**
 * Shared test helpers for SF-Badminton Playwright e2e tests.
 *
 * These talk to the running Next.js app at BASE_URL (default
 * http://localhost:3000). They use a fresh per-call `X-Device-Id` so each
 * test/user gets its own identity in Supabase.
 *
 * EVERY helper that creates server state returns enough info for the caller
 * to clean it up — typically the session id + the creator's device id (the
 * `DELETE /api/sessions/:id` route checks the X-Device-Id matches the
 * creator).
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export interface CreateSessionOpts {
  startsAt?: number;
  endsAt?: number;
  venue?: string;
  venueCustom?: string | null;
  initialCapacity?: number;
}

export interface CreatedSession {
  id: string;
  creatorCode: string;
  deviceId: string;
}

function newDeviceId(): string {
  return randomUUID();
}

/**
 * Returns a (startsAt, endsAt) pair set roughly 24h in the future, so the
 * session shows up in "upcoming" and isn't blocked by past-session guards.
 */
function defaultTimes(): { startsAt: number; endsAt: number } {
  const startsAt = Date.now() + 24 * 60 * 60 * 1000;
  const endsAt = startsAt + 90 * 60 * 1000;
  return { startsAt, endsAt };
}

export async function apiCreateSession(
  opts: CreateSessionOpts = {},
): Promise<CreatedSession> {
  const deviceId = newDeviceId();
  const times = defaultTimes();
  const body = {
    startsAt: opts.startsAt ?? times.startsAt,
    endsAt: opts.endsAt ?? times.endsAt,
    venue: opts.venue ?? 'Shuttl',
    venueCustom: opts.venueCustom,
    initialCapacity: opts.initialCapacity ?? 6,
  };

  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `apiCreateSession failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { id: string; creatorCode: string };
  return { id: data.id, creatorCode: data.creatorCode, deviceId };
}

export async function apiDeleteSession(
  id: string,
  creatorDeviceId: string,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/sessions/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { 'X-Device-Id': creatorDeviceId, Accept: 'application/json' },
    },
  );
  // Tolerate 404 — the session may already be gone.
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(
      `apiDeleteSession failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

export interface JoinedSlot {
  deviceId: string;
  slotId: string;
  state: 'confirmed' | 'waitlist' | 'dropped';
  position: number;
  courtId: string | null;
}

export async function apiJoin(
  sessionId: string,
  displayName: string,
  existingDeviceId?: string,
): Promise<JoinedSlot> {
  const deviceId = existingDeviceId ?? newDeviceId();
  const res = await fetch(
    `${BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/slots`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({ displayName }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`apiJoin failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    slot: {
      id: string;
      state: 'confirmed' | 'waitlist' | 'dropped';
      position: number;
      courtId: string | null;
    };
  };
  return {
    deviceId,
    slotId: data.slot.id,
    state: data.slot.state,
    position: data.slot.position,
    courtId: data.slot.courtId,
  };
}

export async function apiDropSlot(
  slotId: string,
  deviceId: string,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/slots/${encodeURIComponent(slotId)}`,
    {
      method: 'DELETE',
      headers: { 'X-Device-Id': deviceId, Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `apiDropSlot failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Inject an identity into localStorage on every page load (including reloads
 * and navigations within the same origin). Mirrors the shape used by
 * `lib/client/identity.ts` (key = "vibe.identity").
 *
 * Use this for tests that just need "the user is X" for the duration —
 * any in-app mutation that later updates localStorage will be overwritten
 * back to the seeded value on the NEXT navigation. If the test needs to
 * mutate identity from inside the app (e.g. profile rename + reload),
 * use `seedIdentityOnce()` instead.
 */
export async function setIdentity(
  page: Page,
  identity: { id: string; name: string },
): Promise<void> {
  await page.addInitScript(
    ({ id, name }: { id: string; name: string }) => {
      try {
        window.localStorage.setItem(
          'vibe.identity',
          JSON.stringify({ deviceId: id, displayName: name }),
        );
      } catch {
        // ignore — private mode, etc.
      }
    },
    identity,
  );
}

/**
 * Write identity to localStorage exactly once, then leave it alone. Subsequent
 * navigations or reloads pick up whatever is currently in localStorage — so
 * mutations from inside the app (e.g. profile rename) persist correctly.
 *
 * Works by navigating to the origin first (so we have a same-origin context
 * to write into), then setting localStorage via `evaluate`. The caller is
 * expected to navigate to the actual target route afterwards.
 */
export async function seedIdentityOnce(
  page: Page,
  identity: { id: string; name: string },
): Promise<void> {
  // Hit the home page so we're on the right origin. `domcontentloaded` is
  // enough — we just need a same-origin document to write into.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ id, name }) => {
      try {
        window.localStorage.setItem(
          'vibe.identity',
          JSON.stringify({ deviceId: id, displayName: name }),
        );
      } catch {
        // ignore — private mode, etc.
      }
    },
    identity,
  );
}

/**
 * Clears localStorage and walks through the onboarding name prompt on the
 * home page. Asserts that identity is persisted afterwards.
 */
export async function gotoAsNewUser(
  page: Page,
  displayName: string,
): Promise<void> {
  await page.goto('/');
  // Clear storage and reload so we hit the onboarding card.
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.reload();

  const nameInput = page.getByLabel('Your name');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(displayName);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Onboarding card should disappear; the populated home should render.
  await nameInput.waitFor({ state: 'hidden' });

  const persisted = await page.evaluate(() => {
    return window.localStorage.getItem('vibe.identity');
  });
  if (!persisted) {
    throw new Error('gotoAsNewUser: identity was not persisted in localStorage');
  }
  const parsed = JSON.parse(persisted) as { displayName?: string };
  if (parsed.displayName !== displayName) {
    throw new Error(
      `gotoAsNewUser: persisted displayName=${parsed.displayName} expected ${displayName}`,
    );
  }
}

/**
 * Convenience: build a session URL for a created session id.
 */
export function sessionUrl(id: string): string {
  return `/sessions/${encodeURIComponent(id)}`;
}

export { newDeviceId };
