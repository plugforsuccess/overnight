import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

type Ref = { migration: string; table: string; line: number; raw: string };

const migrationsRoot = path.join(process.cwd(), 'prisma', 'migrations');

function normalizeIdentifier(value: string): string {
  const cleaned = value.replace(/"/g, '').trim().toLowerCase();
  if (cleaned.startsWith('public.')) return cleaned.slice('public.'.length);
  return cleaned;
}

function stripComments(line: string): string {
  const idx = line.indexOf('--');
  return idx >= 0 ? line.slice(0, idx) : line;
}

function getMigrationDirs(root: string): string[] {
  return readdirSync(root)
    .filter((name) => name !== 'migration_lock.toml')
    .filter((name) => {
      const dir = path.join(root, name);
      const sql = path.join(dir, 'migration.sql');
      return statSync(dir).isDirectory() && statSync(sql).isFile();
    })
    .sort((a, b) => a.localeCompare(b));
}

function main() {
  const dirs = getMigrationDirs(migrationsRoot);

  const createdGlobal = new Set<string>();
  const createdAnywhere = new Set<string>();
  const orderingViolations: Ref[] = [];
  const shadowIncompatibilities: Ref[] = [];

  for (const migration of dirs) {
    const sqlPath = path.join(migrationsRoot, migration, 'migration.sql');
    const lines = readFileSync(sqlPath, 'utf8').split(/\r?\n/);
    const createdVisible = new Set<string>(createdGlobal);

    lines.forEach((line, i) => {
      const clean = stripComments(line);

      const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)/i;
      const createMatch = clean.match(createRe);
      if (createMatch) {
        const table = normalizeIdentifier(createMatch[1]);
        createdVisible.add(table);
        createdAnywhere.add(table);
      }

      const refRe = /references\s+([\w".]+)/gi;
      let refMatch: RegExpExecArray | null;
      while ((refMatch = refRe.exec(clean)) !== null) {
        const table = normalizeIdentifier(refMatch[1]);
        if (!createdVisible.has(table)) {
          orderingViolations.push({ migration, table, line: i + 1, raw: line.trim() });
        }
      }

      if (/\bauth\s*\./i.test(clean) || /\b"auth"\s*\./i.test(clean)) {
        shadowIncompatibilities.push({ migration, table: 'auth.*', line: i + 1, raw: line.trim() });
      }
    });

    createdVisible.forEach((t) => createdGlobal.add(t));
  }

  const neverCreatedRefs = orderingViolations.filter((r) => !createdAnywhere.has(r.table));

  console.log(`Checked ${dirs.length} migrations in prisma/migrations.`);

  if (neverCreatedRefs.length > 0) {
    console.error('\nReferenced tables never created in migration history:');
    for (const r of neverCreatedRefs) console.error(`  - [${r.migration}:${r.line}] ${r.table} :: ${r.raw}`);
  }

  if (orderingViolations.length > 0) {
    console.error('\nOrdering violations (reference before create):');
    for (const r of orderingViolations) console.error(`  - [${r.migration}:${r.line}] ${r.table} :: ${r.raw}`);
  }

  if (shadowIncompatibilities.length > 0) {
    console.error('\nPotential shadow DB incompatibilities (auth.* usage in SQL):');
    for (const r of shadowIncompatibilities) console.error(`  - [${r.migration}:${r.line}] ${r.raw}`);
  }

  if (!neverCreatedRefs.length && !orderingViolations.length && !shadowIncompatibilities.length) {
    console.log('No migration reference, ordering, or shadow-compatibility issues detected.');
    process.exit(0);
  }

  process.exit(1);
}

main();
