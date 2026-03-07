# DEPRECATED — Knex Migrations

These migrations are **legacy** and no longer the schema authority.

## Current schema authority: Prisma

- Schema definition: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- Commands:
  - `npm run migrate` — deploy migrations to production
  - `npm run migrate:dev` — create new migration during development
  - `npm run migrate:status` — check migration status

## Why these files remain

These Knex migration files are retained as a historical record of the schema
evolution. They should NOT be used for new schema changes.

The Knex runtime (`src/db/connection.ts`, `src/db/index.js`) is still imported
by the Express billing services (`src/billing/`, `src/routes/`, `src/services/`),
which are themselves legacy code not used by the active Next.js application.

## Safe to remove when

These files can be fully deleted once:
1. The Express server (`src/server.js`) is removed
2. All `src/services/*.js` files are removed or ported to Next.js API routes
3. `src/billing/subscription-service.ts` and `src/billing/webhooks.ts` are
   ported to use Supabase client instead of Knex
