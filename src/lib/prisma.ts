/**
 * Prisma Client singleton for server-side database access.
 *
 * Usage:
 *   import { prisma } from '@/lib/prisma';
 *   const parent = await prisma.parent.findUnique({ where: { id } });
 *
 * In development, the client is cached on `globalThis` to survive Next.js
 * hot-reloads without exhausting the connection pool.
 *
 * NOTE: Prisma connects using DATABASE_URL (typically the Supabase direct
 * connection string with service-role privileges). RLS does NOT apply to
 * Prisma queries — the same behavior as the existing Knex connection.
 * For user-scoped queries that need RLS enforcement, continue using the
 * Supabase JS client via supabase-server.ts.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
