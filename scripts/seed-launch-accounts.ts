/**
 * Seed Launch Accounts — Phase B
 *
 * Creates test accounts for all launch roles:
 * - owner, admin, staff, billing, parent
 *
 * Each account gets:
 * - a `users` row (canonical identity)
 * - a `center_memberships` row (for staff/admin roles)
 * - a `child_guardians` row (for parent role)
 *
 * Usage:
 *   npx tsx scripts/seed-launch-accounts.ts
 *
 * Prerequisites:
 *   - Phase A tables must exist (users, center_memberships, child_guardians)
 *   - At least one active center must exist
 *   - DATABASE_URL must be set
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  centerRole?: string;
  isParent?: boolean;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'owner@dreamwatch.test',
    firstName: 'Dana',
    lastName: 'Owner',
    phone: '555-0001',
    centerRole: 'owner',
  },
  {
    email: 'admin@dreamwatch.test',
    firstName: 'Alex',
    lastName: 'Admin',
    phone: '555-0002',
    centerRole: 'admin',
  },
  {
    email: 'staff@dreamwatch.test',
    firstName: 'Sam',
    lastName: 'Staff',
    phone: '555-0003',
    centerRole: 'staff',
  },
  {
    email: 'billing@dreamwatch.test',
    firstName: 'Blair',
    lastName: 'Billing',
    phone: '555-0004',
    centerRole: 'billing_only',
  },
  {
    email: 'parent@dreamwatch.test',
    firstName: 'Pat',
    lastName: 'Parent',
    phone: '555-0005',
    isParent: true,
  },
];

async function main() {
  console.log('=== Phase B: Seed Launch Accounts ===\n');

  // Find the active center
  const center = await prisma.center.findFirst({
    where: { is_active: true },
    select: { id: true, name: true },
  });

  if (!center) {
    console.error('ERROR: No active center found. Create a center first.');
    process.exit(1);
  }

  console.log(`Center: ${center.name} (${center.id})\n`);

  let created = 0;
  let skipped = 0;

  for (const seedUser of SEED_USERS) {
    console.log(`--- ${seedUser.email} (${seedUser.centerRole || 'parent'}) ---`);

    // Upsert user (using raw SQL since users table may not be in Prisma schema yet)
    const existingUser = await prisma.user.findUnique({
      where: { email: seedUser.email },
    });

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`  User exists: ${userId}`);
      skipped++;
    } else {
      const newUser = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: seedUser.email,
          first_name: seedUser.firstName,
          last_name: seedUser.lastName,
          phone: seedUser.phone,
          status: 'active',
        },
      });
      userId = newUser.id;
      console.log(`  User created: ${userId}`);
      created++;
    }

    // Create center membership if this is a staff/admin role
    if (seedUser.centerRole) {
      const existingMembership = await prisma.centerMembership.findUnique({
        where: {
          user_id_center_id: {
            user_id: userId,
            center_id: center.id,
          },
        },
      });

      if (existingMembership) {
        console.log(`  Membership exists: ${existingMembership.role}`);
      } else {
        await prisma.centerMembership.create({
          data: {
            user_id: userId,
            center_id: center.id,
            role: seedUser.centerRole,
            membership_status: 'active',
          },
        });
        console.log(`  Membership created: ${seedUser.centerRole}`);
      }
    }

    // Create guardian link for parent role
    if (seedUser.isParent) {
      // Find a child to link (first active child without a guardian)
      const child = await prisma.child.findFirst({
        where: { active: true },
        select: { id: true, first_name: true, last_name: true },
      });

      if (child) {
        const existingGuardian = await prisma.childGuardian.findUnique({
          where: {
            child_id_user_id: {
              child_id: child.id,
              user_id: userId,
            },
          },
        });

        if (existingGuardian) {
          console.log(`  Guardian link exists for ${child.first_name} ${child.last_name}`);
        } else {
          await prisma.childGuardian.create({
            data: {
              child_id: child.id,
              user_id: userId,
              guardian_role: 'parent',
              is_primary_guardian: true,
              can_book: true,
              can_view_billing: true,
              can_manage_pickups: true,
            },
          });
          console.log(`  Guardian link created for ${child.first_name} ${child.last_name}`);
        }
      } else {
        console.log(`  No active children found for guardian link`);
      }
    }

    console.log('');
  }

  console.log(`=== Done: ${created} created, ${skipped} skipped ===`);
  console.log('\nNote: These are database-only seed records.');
  console.log('To test login, you also need to create auth.users entries in Supabase.');
  console.log('Use the Supabase dashboard or CLI to create auth accounts with matching emails.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
