/**
 * @deprecated — Knex is no longer the schema authority.
 *
 * Schema source of truth: prisma/schema.prisma
 * Migration commands:
 *   npm run migrate        — deploy to production
 *   npm run migrate:dev    — create new migration
 *
 * This file is retained only for the legacy Express billing services
 * (src/billing/, src/routes/, src/services/) which still use Knex at runtime.
 * It will be removed when those services are ported to Supabase client.
 *
 * Legacy usage (DO NOT use for new schema changes):
 *   npm run migrate:knex:legacy
 */
module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || {
      host: '127.0.0.1',
      port: 5432,
      database: 'overnight_dev',
      user: 'postgres',
      password: 'postgres',
    },
    migrations: { directory: './src/db/migrations' },
  },
  test: {
    client: 'pg',
    connection: process.env.TEST_DATABASE_URL || {
      host: '127.0.0.1',
      port: 5432,
      database: 'overnight_test',
      user: 'postgres',
      password: 'postgres',
    },
    migrations: { directory: './src/db/migrations' },
  },
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 0, max: 10 },
    migrations: { directory: './src/db/migrations' },
  },
};
