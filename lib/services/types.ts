/**
 * Shared types for the service layer. Keeping these here (not in schema.ts)
 * lets the route handlers + tests import service types without pulling in
 * `better-sqlite3` transitively.
 */

export type SlotState = 'confirmed' | 'waitlist' | 'dropped';

export const SLOT_STATES = ['confirmed', 'waitlist', 'dropped'] as const;

export interface CreateSessionInput {
  startsAt: number; // unix ms
  endsAt: number; // unix ms
  venue: string; // e.g. 'Shuttl' | 'OneA' | 'Other'
  venueCustom?: string | null;
  creatorDeviceId: string;
  initialCapacity?: number; // default 6, clamped 4..6
  /** Optional — included in the create_session event payload so the audit
   *  log can render "Session created by X" without a slot lookup. */
  creatorDisplayName?: string;
}

export interface UpdateSessionPatch {
  startsAt?: number;
  endsAt?: number;
  venue?: string;
  venueCustom?: string | null;
}

export interface SessionView {
  id: string;
  startsAt: number;
  endsAt: number;
  venue: string;
  venueCustom: string | null;
  totalCostCents: number | null;
  creatorDeviceId: string;
  creatorCode: string;
  createdAt: number;
  courts: CourtView[];
  waitlist: SlotView[];
  recentEvents: EventView[];
}

export interface CourtView {
  id: string;
  sessionId: string;
  label: string;
  bookedAs: string | null;
  capacity: number;
  position: number;
  createdAt: number;
  slots: SlotView[];
}

export interface SlotView {
  id: string;
  sessionId: string;
  courtId: string | null;
  deviceId: string | null;
  displayName: string;
  isPlusOne: boolean;
  plusOneOf: string | null;
  state: SlotState;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface EventView {
  id: string;
  sessionId: string;
  deviceId: string | null;
  action: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface SessionSummary {
  id: string;
  startsAt: number;
  endsAt: number;
  venue: string;
  venueCustom: string | null;
  totalCapacity: number;
  confirmedCount: number;
  waitlistCount: number;
}
