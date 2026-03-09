/**
 * Phase B Verification — Validate Backfill Results
 *
 * Checks that users, center_memberships, and child_guardians were
 * correctly populated from parents and children tables.
 *
 * Usage:
 *   npx tsx scripts/migrations/verify-backfill.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${name}: ${detail}`);
}

async function main() {
  console.log('=== Phase B Verification: Backfill Integrity ===\n');

  // ─── Users vs Parents ────────────────────────────────────────────────────
  console.log('1. Users vs Parents');

  const parentCount = await prisma.parent.count();
  const userCount = await prisma.user.count();
  check(
    'User count matches parent count',
    userCount === parentCount,
    `users=${userCount}, parents=${parentCount}`
  );

  // Check for parents without a corresponding user
  const orphanedParents = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM parents p
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.id)
  `;
  const orphanCount = Number(orphanedParents[0]?.count ?? 0);
  check(
    'No orphaned parents (missing user row)',
    orphanCount === 0,
    `orphaned=${orphanCount}`
  );

  // Check email consistency
  const emailMismatches = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM parents p
    JOIN users u ON u.id = p.id
    WHERE u.email != p.email
  `;
  const mismatchCount = Number(emailMismatches[0]?.count ?? 0);
  check(
    'All user emails match parent emails',
    mismatchCount === 0,
    `mismatches=${mismatchCount}`
  );

  console.log('');

  // ─── Center Memberships vs Admin Parents ─────────────────────────────────
  console.log('2. Center Memberships vs Admin Parents');

  const adminCount = await prisma.parent.count({
    where: {
      OR: [{ role: 'admin' }, { is_admin: true }],
    },
  });
  const membershipCount = await prisma.centerMembership.count();
  check(
    'Membership count matches admin count',
    membershipCount === adminCount,
    `memberships=${membershipCount}, admins=${adminCount}`
  );

  // Check all memberships are active
  const activeMemberships = await prisma.centerMembership.count({
    where: { membership_status: 'active' },
  });
  check(
    'All memberships are active',
    activeMemberships === membershipCount,
    `active=${activeMemberships}, total=${membershipCount}`
  );

  // Check all memberships have role=admin (from backfill)
  const adminMemberships = await prisma.centerMembership.count({
    where: { role: 'admin' },
  });
  check(
    'All backfilled memberships have role=admin',
    adminMemberships === membershipCount,
    `admin_role=${adminMemberships}, total=${membershipCount}`
  );

  console.log('');

  // ─── Child Guardians vs Children ─────────────────────────────────────────
  console.log('3. Child Guardians vs Children');

  const activeChildCount = await prisma.child.count({ where: { active: true } });
  const guardianCount = await prisma.childGuardian.count();
  check(
    'Guardian count matches active child count',
    guardianCount === activeChildCount,
    `guardians=${guardianCount}, active_children=${activeChildCount}`
  );

  // Check all guardians are primary
  const primaryGuardians = await prisma.childGuardian.count({
    where: { is_primary_guardian: true },
  });
  check(
    'All backfilled guardians are primary',
    primaryGuardians === guardianCount,
    `primary=${primaryGuardians}, total=${guardianCount}`
  );

  // Check all guardians have role=parent
  const parentGuardians = await prisma.childGuardian.count({
    where: { guardian_role: 'parent' },
  });
  check(
    'All backfilled guardians have role=parent',
    parentGuardians === guardianCount,
    `parent_role=${parentGuardians}, total=${guardianCount}`
  );

  // Check permissions flags
  const fullPermGuardians = await prisma.childGuardian.count({
    where: {
      can_book: true,
      can_view_billing: true,
      can_manage_pickups: true,
    },
  });
  check(
    'All backfilled guardians have full permissions',
    fullPermGuardians === guardianCount,
    `full_perms=${fullPermGuardians}, total=${guardianCount}`
  );

  // Check for orphaned guardians (child_id not in children)
  const orphanedGuardians = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM child_guardians cg
    WHERE NOT EXISTS (SELECT 1 FROM children c WHERE c.id = cg.child_id)
  `;
  const orphanGuardianCount = Number(orphanedGuardians[0]?.count ?? 0);
  check(
    'No orphaned guardian rows',
    orphanGuardianCount === 0,
    `orphaned=${orphanGuardianCount}`
  );

  console.log('');

  // ─── Summary ─────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error('\nBackfill verification FAILED. Review the failures above.');
    process.exit(1);
  } else {
    console.log('\nBackfill verification PASSED. Safe to proceed to Phase C.');
  }
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
