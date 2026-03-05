// src/db/connection.ts
import type { Knex } from "knex";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function knexConfig(): Knex.Config {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    requireEnv("SUPABASE_DB_URL");

  const isProd = process.env.NODE_ENV === "production";

  return {
    client: "pg",
    connection: {
      connectionString,
      ssl: isProd
        ? { rejectUnauthorized: false } // Supabase requires SSL; this is common in serverless
        : undefined,
      application_name: "overnight-app",
    },
    pool: {
      min: 0,
      max: Number(process.env.DB_POOL_MAX || 10),
      // If your app is serverless, keep max lower (e.g. 3–5) to avoid exhausting DB connections.
      acquireTimeoutMillis: 10_000,
      createTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    },
    // Migrations are handled by knex migrate tooling (or Supabase migrations).
    migrations: {
      tableName: "knex_migrations",
      directory: "./src/db/migrations",
    },
  };
}