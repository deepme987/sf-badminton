/**
 * Typed fetch wrapper for the route handlers. One function per endpoint.
 * Mutations auto-send `X-Device-Id` from the caller-provided device id.
 *
 * Non-2xx responses are mapped to `ApiError` carrying the parsed `error.code`
 * so callers can map "unauthorized" / "conflict" / "validation_failed" to UI.
 *
 * Note on response shapes: the server uses two patterns:
 *   - List + read endpoints return the view payload directly (array or
 *     SessionView)
 *   - Mutating endpoints typically wrap in `{ session }` or `{ slot }`
 *
 * We normalize both at the boundary so callers always get the unwrapped
 * type.
 */
import type {
  SessionSummary,
  SessionView,
  SlotView,
} from '@/lib/services/types';

export type ApiErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'internal_error'
  | 'network_error';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ServerErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

async function request<T>(
  url: string,
  init: RequestInit & { deviceId?: string } = {},
): Promise<T> {
  const { deviceId, headers, ...rest } = init;
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (rest.body !== undefined && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (deviceId) {
    finalHeaders['X-Device-Id'] = deviceId;
  }

  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: finalHeaders });
  } catch (cause) {
    throw new ApiError(
      'network_error',
      cause instanceof Error ? cause.message : 'network error',
      0,
    );
  }

  let body: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const errBody = (body ?? {}) as ServerErrorBody;
    const code = (errBody.error?.code ?? 'internal_error') as ApiErrorCode;
    const message = errBody.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(code, message, res.status, errBody.error?.details);
  }

  return body as T;
}

// ─── Sessions: list ────────────────────────────────────────────────────────

export async function fetchUpcomingSessions(): Promise<SessionSummary[]> {
  const data = await request<SessionSummary[] | { sessions: SessionSummary[] }>(
    '/api/sessions/upcoming',
  );
  return Array.isArray(data) ? data : data.sessions;
}

export async function fetchPastSessions(): Promise<SessionSummary[]> {
  const data = await request<SessionSummary[] | { sessions: SessionSummary[] }>(
    '/api/sessions/past',
  );
  return Array.isArray(data) ? data : data.sessions;
}

// ─── Sessions: single ──────────────────────────────────────────────────────

export async function fetchSession(id: string): Promise<SessionView> {
  return request<SessionView>(`/api/sessions/${encodeURIComponent(id)}`);
}

export interface CreateSessionPayload {
  startsAt: number;
  endsAt: number;
  venue: string;
  venueCustom?: string | null;
  initialCapacity?: number;
  /** Optional — passed so the audit log can render "Session created by X". */
  creatorDisplayName?: string;
}

export async function createSession(
  payload: CreateSessionPayload,
  deviceId: string,
): Promise<SessionView> {
  const data = await request<SessionView | { session: SessionView }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
    deviceId,
  });
  return 'session' in (data as object) && (data as { session?: SessionView }).session
    ? (data as { session: SessionView }).session
    : (data as SessionView);
}

export interface UpdateSessionPayload {
  startsAt?: number;
  endsAt?: number;
  venue?: string;
  venueCustom?: string | null;
}

export async function updateSession(
  id: string,
  payload: UpdateSessionPayload,
  deviceId: string,
): Promise<SessionView> {
  const data = await request<SessionView | { session: SessionView }>(
    `/api/sessions/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      deviceId,
    },
  );
  return 'session' in (data as object) && (data as { session?: SessionView }).session
    ? (data as { session: SessionView }).session
    : (data as SessionView);
}

export async function deleteSession(id: string, deviceId: string): Promise<void> {
  await request<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    deviceId,
  });
}

export async function rotateCreatorCode(
  sessionId: string,
  deviceId: string,
): Promise<{ session: SessionView; code: string }> {
  return request<{ session: SessionView; code: string }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/creator-code/rotate`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      deviceId,
    },
  );
}

export async function setSessionCost(
  id: string,
  totalCostCents: number | null,
  deviceId: string,
): Promise<SessionView> {
  const data = await request<SessionView | { session: SessionView }>(
    `/api/sessions/${encodeURIComponent(id)}/cost`,
    {
      method: 'PATCH',
      body: JSON.stringify({ totalCostCents }),
      deviceId,
    },
  );
  return 'session' in (data as object) && (data as { session?: SessionView }).session
    ? (data as { session: SessionView }).session
    : (data as SessionView);
}

// ─── Courts ────────────────────────────────────────────────────────────────

export async function addCourt(
  sessionId: string,
  capacity: number | undefined,
  deviceId: string,
): Promise<SessionView> {
  const body = capacity === undefined ? {} : { capacity };
  const data = await request<{ session: SessionView }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/courts`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      deviceId,
    },
  );
  return data.session;
}

export async function patchCourt(
  courtId: string,
  payload: { capacity?: number; bookedAs?: string | null },
  deviceId: string,
): Promise<SessionView> {
  const data = await request<{ session: SessionView }>(
    `/api/courts/${encodeURIComponent(courtId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      deviceId,
    },
  );
  return data.session;
}

// ─── Slots ─────────────────────────────────────────────────────────────────

export async function joinSession(
  sessionId: string,
  displayName: string,
  deviceId: string,
): Promise<SlotView> {
  const data = await request<{ slot: SlotView }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/slots`,
    {
      method: 'POST',
      body: JSON.stringify({ displayName }),
      deviceId,
    },
  );
  return data.slot;
}

export async function dropSlot(slotId: string, deviceId: string): Promise<SessionView> {
  const data = await request<{ session: SessionView }>(
    `/api/slots/${encodeURIComponent(slotId)}`,
    {
      method: 'DELETE',
      deviceId,
    },
  );
  return data.session;
}

export async function addPlusOne(
  slotId: string,
  plusOneName: string,
  deviceId: string,
): Promise<SlotView> {
  const data = await request<{ slot: SlotView }>(
    `/api/slots/${encodeURIComponent(slotId)}/plus-one`,
    {
      method: 'POST',
      body: JSON.stringify({ plusOneName }),
      deviceId,
    },
  );
  return data.slot;
}
