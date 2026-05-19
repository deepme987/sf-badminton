/**
 * Vitest global setup. Runs once per worker before any test file is loaded.
 *
 * Loads `.env.local` into `process.env` so tests can connect to the real
 * Supabase instance (single-fork sequential — see vitest.config.ts).
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  throw new Error(
    'DATABASE_URL is not set. Make sure .env.local exists at the repo root and contains DATABASE_URL.',
  );
}
