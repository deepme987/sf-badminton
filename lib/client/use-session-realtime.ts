'use client';

/**
 * Subscribes to Supabase realtime changes for one session and fires `onChange`
 * whenever the session's rows mutate in postgres. Replaces the old polling
 * loop on the session-detail page.
 *
 * Listens to:
 *   - sessions (filter: id = session_id)
 *   - courts   (filter: session_id = session_id)
 *   - slots    (filter: session_id = session_id)
 *   - events   (filter: session_id = session_id)
 *
 * Behavior:
 *   - All four channel events flow through a single 200ms debounce so a
 *     transaction that touches several rows (drop -> auto-promote -> event)
 *     collapses into ONE refetch.
 *   - When `enabled` flips from true → false (tab hidden), the channel is
 *     unsubscribed.
 *   - When `enabled` flips back true (tab visible), the channel is rebuilt
 *     AND `onChange` fires immediately so the page catches up after a long
 *     idle.
 *   - Status is reported as 'connecting' | 'subscribed' | 'errored' | 'closed'.
 *     If env vars are missing we surface 'errored' and never crash.
 *
 * Cleanup: unsubscribe + clear the debounce timer on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export type RealtimeStatus = 'connecting' | 'subscribed' | 'errored' | 'closed';

const DEBOUNCE_MS = 200;

interface UseSessionRealtimeArgs {
  sessionId: string;
  enabled: boolean;
  onChange: () => void;
}

export function useSessionRealtime({
  sessionId,
  enabled,
  onChange,
}: UseSessionRealtimeArgs): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  // Keep the latest onChange in a ref so the subscription effect doesn't
  // re-tear-down whenever the parent re-renders with a fresh closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) {
      setStatus('closed');
      return;
    }

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;

    const fireDebounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!cancelled) onChangeRef.current();
      }, DEBOUNCE_MS);
    };

    let client;
    try {
      client = getSupabase();
    } catch {
      // Missing env vars or another init error — fall back gracefully. The
      // caller's parent effect will keep `onChange` callable; we just never
      // fire it from here.
      setStatus('errored');
      return;
    }

    setStatus('connecting');

    // postgres_changes filters are server-evaluated strings of the form
    // `<column>=eq.<value>`. `sessions` is keyed by `id`; the other tables
    // are keyed by `session_id`.
    type ChangeHandler = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => void;
    const handler: ChangeHandler = () => {
      fireDebounced();
    };

    channel = client.channel(`session:${sessionId}`);

    // The Supabase client's postgres_changes overload has a non-trivial type;
    // we cast `channel.on` once to keep the chained subscription readable
    // without re-deriving the generic at every call site.
    type OnPostgresChanges = (
      type: 'postgres_changes',
      filter: {
        event: '*';
        schema: 'public';
        table: 'sessions' | 'courts' | 'slots' | 'events';
        filter: string;
      },
      cb: ChangeHandler,
    ) => RealtimeChannel;
    const on = channel.on.bind(channel) as unknown as OnPostgresChanges;

    on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      handler,
    );
    on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'courts',
        filter: `session_id=eq.${sessionId}`,
      },
      handler,
    );
    on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'slots',
        filter: `session_id=eq.${sessionId}`,
      },
      handler,
    );
    on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `session_id=eq.${sessionId}`,
      },
      handler,
    );

    channel.subscribe((channelStatus) => {
      if (cancelled) return;
      // Supabase emits SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED.
      // Map to our 4-state status enum.
      if (channelStatus === 'SUBSCRIBED') {
        setStatus('subscribed');
        // Catch-up fetch when we (re)subscribe — handles the
        // hidden-tab → visible flow and the initial mount.
        onChangeRef.current();
      } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
        setStatus('errored');
      } else if (channelStatus === 'CLOSED') {
        setStatus('closed');
      }
    });

    return () => {
      cancelled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (channel) {
        // removeChannel returns a promise; we don't need to await it on
        // unmount but we do want to swallow rejections so a stale teardown
        // doesn't surface as an unhandled rejection.
        void client.removeChannel(channel).catch(() => {});
      }
    };
  }, [sessionId, enabled]);

  return status;
}
