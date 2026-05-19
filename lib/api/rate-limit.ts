/**
 * Process-local token-bucket rate limiter, keyed by device id.
 *
 * Why this exists: the public mutation endpoints (POST /api/sessions, joins,
 * +1s, court mutations, drops) are open by design — anyone with a session URL
 * can join, anyone with a creator code can mutate. There's no auth wall, just
 * a device-id header that the client generates locally. That means a hostile
 * script can hammer any of these endpoints from a single browser tab. Without
 * a token bucket, a few minutes of abuse would fill the Supabase free tier
 * and DOS legitimate users.
 *
 * Constants chosen for ~90 users in the SF group:
 *   - CAPACITY = 20 burst per device
 *   - REFILL_PER_MIN = 20 (one token every 3s)
 *
 * A reasonable joiner does ~5 mutations in an hour (join, +1, maybe drop).
 * Even an enthusiastic creator stays well under 20/min. The 3s refill rate
 * is fast enough that the rare double-tap is invisible.
 *
 * **Scaling caveat:** this map lives in the Node process. Vercel routes each
 * request to whichever serverless instance is warm, so two requests from the
 * same device can land on different processes and "see" full buckets. For
 * our scale (single region, ~90 users, a handful of warm instances) the
 * collision rate is low enough that abuse still bottlenecks somewhere — it's
 * a soft cap, not a hard one. If we ever hit real abuse, swap this for an
 * Upstash Redis / Vercel KV backed bucket.
 */

const CAPACITY = 20;
const REFILL_PER_MIN = 20;
const REFILL_INTERVAL_MS = (60 * 1000) / REFILL_PER_MIN; // 3000ms per token
const IDLE_EVICT_MS = 10 * 60 * 1000; // drop entries idle > 10 min
const CLEANUP_INTERVAL_MS = 60 * 1000; // sweep once a minute

interface Bucket {
  tokens: number;
  /** ms timestamp of the last refill calculation. */
  refilledAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Refills the bucket lazily based on elapsed time. Mutates `b` in place and
 * returns it for chaining convenience.
 */
function refill(b: Bucket, now: number): Bucket {
  const elapsed = now - b.refilledAt;
  if (elapsed <= 0) return b;
  const gained = Math.floor(elapsed / REFILL_INTERVAL_MS);
  if (gained > 0) {
    b.tokens = Math.min(CAPACITY, b.tokens + gained);
    b.refilledAt += gained * REFILL_INTERVAL_MS;
  }
  return b;
}

export interface RateLimitResult {
  ok: boolean;
  /** When `ok` is false, ms until the next token becomes available. 0 otherwise. */
  retryAfterMs: number;
}

/**
 * Spend `cost` tokens from `deviceId`'s bucket. Returns `{ ok: true }` if the
 * request is allowed, or `{ ok: false, retryAfterMs }` if it should be 429'd.
 *
 * Default cost = 1. Callers can charge a heavier cost for expensive mutations
 * (e.g. session creation could be cost 3) — none do today.
 */
export function checkRateLimit(deviceId: string, cost: number = 1): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(deviceId);
  if (!bucket) {
    bucket = { tokens: CAPACITY, refilledAt: now };
    buckets.set(deviceId, bucket);
  } else {
    refill(bucket, now);
  }

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return { ok: true, retryAfterMs: 0 };
  }

  // Compute how long until the bucket holds `cost` tokens.
  const deficit = cost - bucket.tokens;
  const retryAfterMs = deficit * REFILL_INTERVAL_MS - (now - bucket.refilledAt);
  return { ok: false, retryAfterMs: Math.max(0, retryAfterMs) };
}

/**
 * Test/diagnostic helper — clears all buckets. Not exported to route handlers.
 */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}

/**
 * Test/diagnostic helper — peek at bucket state.
 */
export function _getBucketForTests(deviceId: string): Bucket | undefined {
  return buckets.get(deviceId);
}

// ── Periodic eviction so the Map doesn't grow without bound ──────────────────
// `setInterval` is fine here — Node's default scheduling keeps it idle-cheap,
// and we use `.unref()` so the interval doesn't keep the process alive when
// there's nothing else queued (matters for test teardown).
if (typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const cutoff = Date.now() - IDLE_EVICT_MS;
    for (const [key, b] of buckets) {
      // A bucket is "idle" if its last activity (refilledAt is the proxy)
      // is older than the cutoff AND the bucket is effectively full (no
      // pending recovery). The double check avoids evicting a hot-but-empty
      // bucket that's mid-burst.
      if (b.refilledAt < cutoff && b.tokens >= CAPACITY) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // unref so vitest / jest workers can exit cleanly.
  if (typeof handle === 'object' && handle && 'unref' in handle) {
    (handle as { unref: () => void }).unref();
  }
}
