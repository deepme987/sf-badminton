'use client';

/**
 * Browser-side Supabase client. Used for realtime channel subscriptions on the
 * session-detail page (replaces the old 8-second polling loop).
 *
 * We use the publishable key here — it's safe to expose to the browser and is
 * gated by Supabase row-level-security on read. The DATABASE_URL + the
 * SUPABASE_SECRET_KEY stay strictly server-side.
 *
 * The realtime channel itself does NOT count as a DB read; it surfaces logical
 * replication events that Postgres emits whenever a row in a published table
 * changes. We subscribe to `sessions`, `courts`, `slots`, and `events` filtered
 * by the current session id and refetch the full SessionView via `fetchSession`
 * on any change. This trades realtime granularity for backend simplicity: the
 * existing `loadSessionView` query is the single source of truth.
 *
 * Throughput is capped at 5 events/sec on the client side so a burst (e.g. a
 * waitlist auto-promote that touches multiple slot rows in one transaction)
 * doesn't fan out into a flurry of fetches — the `use-session-realtime` hook
 * additionally debounces at 200ms.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

class MissingSupabaseEnvError extends Error {
  constructor() {
    super(
      'Supabase env vars missing — NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.',
    );
    this.name = 'MissingSupabaseEnvError';
  }
}

/**
 * Returns the process-wide singleton Supabase client. Lazily initialized so
 * the import itself never throws — callers that need to gracefully degrade
 * (e.g. the realtime hook falling back to "errored" status) can wrap this in
 * a try/catch.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new MissingSupabaseEnvError();
  }
  cached = createClient(url, key, {
    realtime: {
      params: {
        eventsPerSecond: 5,
      },
    },
    auth: {
      // Browser-only client used for unauthenticated realtime subscriptions.
      // No session persistence needed — we don't sign users in via Supabase.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
