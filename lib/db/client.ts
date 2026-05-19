/**
 * Drizzle + postgres-js client. We talk to Supabase's transaction pooler
 * (port 6543), which does NOT support prepared statements — `prepare: false`
 * is required. Keep pool max low; the pooler multiplexes for us.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export type DbClient = PostgresJsDatabase<typeof schema>;

let cachedClient: Sql | null = null;
let cachedDb: DbClient | null = null;

function resolveUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

/**
 * Construct a new postgres-js client + drizzle wrapper. Callers wanting the
 * shared process-wide singleton should use `getDb()` instead.
 */
export function createDbClient(url: string = resolveUrl()): { client: Sql; db: DbClient } {
  const client = postgres(url, {
    prepare: false, // required for Supabase's transaction pooler (:6543)
    max: 5,
    idle_timeout: 20,
  });
  const db = drizzle(client, { schema });
  return { client, db };
}

/**
 * Process-wide singleton. Route handlers should use this so we don't open a
 * new pool per request.
 */
export function getDb(): DbClient {
  if (!cachedDb) {
    const { client, db } = createDbClient();
    cachedClient = client;
    cachedDb = db;
  }
  return cachedDb;
}

/**
 * Clean shutdown — closes the underlying connection pool. Tests should call
 * this in their `afterAll` hook so vitest can exit cleanly.
 */
export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end({ timeout: 5 });
  }
  cachedClient = null;
  cachedDb = null;
}

/**
 * Test helper: swap the cached singleton. Mostly used so different test
 * suites can share the same connection.
 */
export function _setDbForTests(db: DbClient | null, client: Sql | null = null): void {
  cachedDb = db;
  cachedClient = client;
}
