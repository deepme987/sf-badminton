// Postgres schema for Vibe Badminton (v1). Service API speaks unix-ms; we
// convert to/from `Date` at the DB boundary (see lib/services/sessions.ts).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * Notes:
 * - Session ids stay as 4-char text slugs (`'k4p9'` etc).
 * - Court / slot / event ids are real Postgres UUIDs.
 * - Timestamps are `timestamptz`.
 * - `slots.is_plus_one` is a real boolean.
 * - `events.payload` is `jsonb` — Drizzle returns/accepts a JS object directly.
 * - RLS is enabled in Supabase and we use the service-role key from server-only
 *   code (Route Handlers). The schema doesn't model RLS.
 */

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // 4-char slug
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
  venue: text('venue').notNull(),
  venueCustom: text('venue_custom'),
  totalCostCents: integer('total_cost_cents'),
  creatorDeviceId: text('creator_device_id').notNull(),
  creatorCode: text('creator_code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
});

export const courts = pgTable(
  'courts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    bookedAs: text('booked_as'),
    capacity: integer('capacity').notNull().default(6),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    sessionPositionIdx: index('idx_courts_session_position').on(
      table.sessionId,
      table.position,
    ),
    sessionPositionUq: uniqueIndex('uq_courts_session_position').on(
      table.sessionId,
      table.position,
    ),
    capacityChk: check('courts_capacity_chk', sql`${table.capacity} between 4 and 6`),
  }),
);

export const slots = pgTable(
  'slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    courtId: uuid('court_id').references(() => courts.id, { onDelete: 'set null' }),
    deviceId: text('device_id'),
    displayName: text('display_name').notNull(),
    isPlusOne: boolean('is_plus_one').notNull().default(false),
    plusOneOf: uuid('plus_one_of').references((): AnyPgColumn => slots.id, {
      onDelete: 'set null',
    }),
    state: text('state').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    sessionStateIdx: index('idx_slots_session_state_position').on(
      table.sessionId,
      table.state,
      table.position,
    ),
    courtStateIdx: index('idx_slots_court_state').on(table.courtId, table.state),
    stateChk: check(
      'slots_state_chk',
      sql`${table.state} in ('confirmed','waitlist','dropped')`,
    ),
  }),
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    deviceId: text('device_id'),
    action: text('action').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    sessionCreatedIdx: index('idx_events_session_created').on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;

export type CourtRow = typeof courts.$inferSelect;
export type CourtInsert = typeof courts.$inferInsert;

export type SlotRow = typeof slots.$inferSelect;
export type SlotInsert = typeof slots.$inferInsert;

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
