// src/db/migrate.ts
import db from "./index";

export async function runMigrations() {
  // NOTE: In production, prefer Supabase migrations or CI migrations.
  // Avoid running migrations automatically at runtime in serverless.
  const [batchNo, log] = await db.migrate.latest();
  return { batchNo, log };
}

export async function rollbackMigrations() {
  const [batchNo, log] = await db.migrate.rollback();
  return { batchNo, log };
}