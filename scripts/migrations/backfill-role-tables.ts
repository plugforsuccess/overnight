/**
 * Phase B — Backfill Multi-Tenant Role Tables
 *
 * This script populates the new `users`, `center_memberships`, and
 * `child_guardians` tables from existing data in `parents` and `children`.
 *
 * Prerequisites:
 *   - Phase A migration has been applied (tables exist)
 *   - Database connection via DATABASE_URL env var
 *
 * Usage:
 *   npx tsx scripts/migrations/backfill-role-tables.ts
 *
 * This script is idempotent — safe to run multiple times.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Phase B: Backfill Multi-Tenant Role Tables ===\n');

  // ─── Step 1: Backfill users from parents ─────────────────────────────────
  console.log('Step 1: Backfilling users from parents...');

  const parents = await prisma.parent.findMany({
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      phone: true,
    },
  });

  let usersCreated = 0;
  let usersSkipped = 0;

  for (const parent of parents) {
    try {
      await prisma.user.upsert({
        where: { id: parent.id },
        create: {
          id: parent.id,
          email: parent.email,
          first_name: parent.first_name,
          last_name: parent.last_name,
          phone: parent.phone,
          status: 'active',
        },
        update: {}, // No-op if already exists
      });
      usersCreated++;
    } catch (err) {
      console.error(`  Error creating user for parent ${parent.id}:`, err);
      usersSkipped++;
    }
  }

  console.log(`  Created: ${usersCreated}, Skipped: ${usersSkipped}`);
  console.log(`  Total parents: ${parents.length}\n`);

  // ─── Step 2: Backfill center_memberships for admins ──────────────────────
  console.log('Step 2: Backfilling center_memberships for admin users...');

  // Find the active center (single-center launch = Dreamwatch Overnight)
  const center = await prisma.center.findFirst({
    where: { is_active: true },
    select: { id: true, name: true },
  });

  if (!center) {
    console.error('  ERROR: No active center found. Skipping membership backfill.');
  } else {
    console.log(`  Target center: ${center.name} (${center.id})`);

    const admins = await prisma.parent.findMany({
      where: {
        OR: [
          { role: 'admin' },
          { is_admin: true },
        ],
      },
      select: { id: true, email: true },
    });

    let membershipsCreated = 0;
    let membershipsSkipped = 0;

    for (const admin of admins) {
      try {
        await prisma.centerMembership.upsert({
          where: {
            user_id_center_id: {
              user_id: admin.id,
              center_id: center.id,
            },
          },
          create: {
            user_id: admin.id,
            center_id: center.id,
            role: 'admin',
            membership_status: 'active',
          },
          update: {}, // No-op if already exists
        });
        membershipsCreated++;
      } catch (err) {
        console.error(`  Error creating membership for admin ${admin.id}:`, err);
        membershipsSkipped++;
      }
    }

    console.log(`  Created: ${membershipsCreated}, Skipped: ${membershipsSkipped}`);
    console.log(`  Total admins: ${admins.length}\n`);
  }

  // ─── Step 3: Backfill child_guardians from children ──────────────────────
  console.log('Step 3: Backfilling child_guardians from parent-child relationships...');

  const children = await prisma.child.findMany({
    where: { active: true },
    select: {
      id: true,
      parent_id: true,
    },
  });

  let guardiansCreated = 0;
  let guardiansSkipped = 0;

  for (const child of children) {
    try {
      await prisma.childGuardian.upsert({
        where: {
          child_id_user_id: {
            child_id: child.id,
            user_id: child.parent_id,
          },
        },
        create: {
          child_id: child.id,
          user_id: child.parent_id,
          guardian_role: 'parent',
          is_primary_guardian: true,
          can_book: true,
          can_view_billing: true,
          can_manage_pickups: true,
        },
        update: {}, // No-op if already exists
      });
      guardiansCreated++;
    } catch (err) {
      console.error(`  Error creating guardian for child ${child.id}:`, err);
      guardiansSkipped++;
    }
  }

  console.log(`  Created: ${guardiansCreated}, Skipped: ${guardiansSkipped}`);
  console.log(`  Total children: ${children.length}\n`);

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('=== Backfill Complete ===');
  console.log(`  Users: ${usersCreated} created`);
  console.log(`  Center Memberships: ${center ? 'done' : 'skipped (no center)'}`);
  console.log(`  Child Guardians: ${guardiansCreated} created`);
  console.log('\nRun verify-backfill.ts to validate the results.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
