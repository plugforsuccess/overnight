// src/db/connection.ts
//
// @deprecated — Legacy Knex connection. Not used by the active Next.js application.
// Retained only for Express billing services (src/billing/, src/routes/).
// See ARCHITECTURE.md > Legacy Code Boundary.

import type { Knex } from "knex";

/**
 * Builds a Knex configuration targeting Postgres.
 *
 * Required env vars (at least one):
 *   SUPABASE_DB_URL  – Supabase pooler / direct connection string
 *   DATABASE_URL     – Generic Postgres connection string
 *
 * For local dev without either var, falls back to localhost defaults.
 */
export function knexConfig(): Knex.Config {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    undefined;

  const isProd = process.env.NODE_ENV === "production";

  const connection: Record<string, unknown> = connectionString
    ? {
        connectionString,
        // Supabase requires SSL in production; rejectUnauthorized:false is
        // standard for managed Postgres behind a trusted proxy.
        ssl: isProd ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: "127.0.0.1",
        port: 5432,
        database: "overnight_dev",
        user: "postgres",
        password: "postgres",
      };

  return {
    client: "pg",
    connection,
    pool: {
      min: 0,
      max: Number(process.env.DB_POOL_MAX || 10),
      acquireTimeoutMillis: 10_000,
      createTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: "./src/db/migrations",
    },
  };
}