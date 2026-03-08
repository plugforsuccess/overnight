-- ─────────────────────────────────────────────────────────────
-- ci-bootstrap-supabase.sql — Supabase auth stubs for CI
-- ─────────────────────────────────────────────────────────────
-- In production, Supabase provides the `auth` schema, `auth.uid()`
-- function, and `authenticated`/`anon`/`service_role` roles.
-- In CI we run against vanilla Postgres and need minimal stubs
-- so that CREATE POLICY ... TO authenticated USING (auth.uid())
-- statements in migrations don't fail.
--
-- These stubs are NOT security-functional — they exist only to
-- let DDL parse and apply. CI never exercises RLS at runtime.
-- ─────────────────────────────────────────────────────────────

-- 1. Roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- 2. Auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- 3. auth.uid() stub — returns NULL (no user context in CI)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid;
$$;

-- 4. Extensions used by migrations
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
