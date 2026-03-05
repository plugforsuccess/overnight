/**
 * Knex CLI configuration.
 *
 * All environments now target Postgres. Local dev should point DATABASE_URL
 * at a local Postgres instance (e.g. via Docker or Supabase CLI).
 *
 * Usage:
 *   npx knex migrate:latest
 *   npx knex migrate:rollback
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
