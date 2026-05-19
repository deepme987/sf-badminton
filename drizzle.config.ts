import type { Config } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  // drizzle-kit reads this at config load (e.g. for `drizzle-kit pull` /
  // `studio`). Fail loudly so we never accidentally run against the wrong db.
  // Don't throw in module side effects when used as a library though — this
  // file is only executed by drizzle-kit's CLI.
  // eslint-disable-next-line no-console
  console.warn('[drizzle.config] DATABASE_URL is not set');
}

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: url ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
