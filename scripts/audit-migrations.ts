#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

type Severity = 'critical' | 'warning' | 'info';
interface Issue { severity: Severity; code: string; message: string; details?: string; source?: string; }

interface SchemaField { name: string; type: string; optional: boolean; defaultValue?: string; mappedName?: string; isId?: boolean; relation?: { fields: string[]; references: string[]; targetModel: string }; }
interface SchemaModel { name: string; table: string; fields: SchemaField[]; uniques: string[][]; indexes: string[][]; }

interface MigrationSummary {
  name: string;
  creates: string[];
  alters: string[];
  dependsOn: string[];
  unsafeAssumptions: string[];
  createdColumns: Record<string, Set<string>>;
}

const root = process.cwd();
const schemaPath = path.join(root, 'prisma/schema.prisma');
const migrationsDir = path.join(root, 'prisma/migrations');
const docsDir = path.join(root, 'docs/db');
const reportsDir = path.join(root, 'reports');
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

function read(file: string) { return fs.readFileSync(file, 'utf8'); }

function parseModels(schema: string): SchemaModel[] {
  const models: SchemaModel[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRegex.exec(schema))) {
    const [, modelName, block] = m;
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean).filter(l => !l.startsWith('//'));
    let table = modelName;
    const fields: SchemaField[] = [];
    const uniques: string[][] = [];
    const indexes: string[][] = [];

    for (const line of lines) {
      if (line.startsWith('@@map(')) {
        table = line.match(/@@map\("([^"]+)"\)/)?.[1] ?? table;
      } else if (line.startsWith('@@unique(')) {
        const cols = line.match(/\[([^\]]+)\]/)?.[1]?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
        uniques.push(cols);
      } else if (line.startsWith('@@index(')) {
        const cols = line.match(/\[([^\]]+)\]/)?.[1]?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
        indexes.push(cols);
      } else if (line.startsWith('@@')) {
        continue;
      } else {
        const parts = line.split(/\s+/);
        const name = parts[0];
        if (!name) continue;
        const rawType = parts[1] ?? '';
        const optional = rawType.endsWith('?');
        const type = rawType.replace(/[\?\[\]]/g, '');
        const defaultValue = line.match(/@default\(([^\)]+)\)/)?.[1];
        const mappedName = line.match(/@map\("([^"]+)"\)/)?.[1];
        const isId = line.includes('@id');
        const relMatch = line.match(/@relation\(fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/);
        const targetModel = parts[1]?.endsWith('[]') ? parts[1].replace('[]', '') : parts[1]?.replace('?', '');
        const relation = relMatch ? {
          fields: relMatch[1].split(',').map(s => s.trim()),
          references: relMatch[2].split(',').map(s => s.trim()),
          targetModel: targetModel ?? '',
        } : undefined;
        fields.push({ name, type, optional, defaultValue, mappedName, isId, relation });
      }
    }
    models.push({ name: modelName, table, fields, uniques, indexes });
  }
  return models;
}

function parseCreateTable(sql: string): { table: string; cols: string[]; refs: string[] }[] {
  const out: { table: string; cols: string[]; refs: string[] }[] = [];
  const re = /CREATE TABLE(?: IF NOT EXISTS)?\s+"?([\w\.]+)"?\s*\(([\s\S]*?)\);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1].replace(/^public\./, '');
    const body = m[2];
    const cols: string[] = [];
    const refs: string[] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('CONSTRAINT')) {
        const ref = line.match(/REFERENCES\s+"?([\w\.]+)"?/i)?.[1];
        if (ref) refs.push(ref.replace(/^public\./, ''));
        continue;
      }
      const cm = line.match(/^"?([a-zA-Z_][\w]*)"?\s+/);
      if (cm) cols.push(cm[1]);
      const ref = line.match(/REFERENCES\s+"?([\w\.]+)"?/i)?.[1];
      if (ref) refs.push(ref.replace(/^public\./, ''));
    }
    out.push({ table, cols, refs });
  }
  return out;
}

function parseMigration(name: string, sql: string): MigrationSummary {
  const creates: string[] = [];
  const alters: string[] = [];
  const dependsOn = new Set<string>();
  const unsafeAssumptions: string[] = [];
  const createdColumns: Record<string, Set<string>> = {};

  for (const ct of parseCreateTable(sql)) {
    creates.push(ct.table);
    createdColumns[ct.table] = new Set(ct.cols);
    ct.refs.forEach(r => dependsOn.add(r));
  }

  const alterTable = /ALTER TABLE\s+"?([\w\.]+)"?\s+([\s\S]*?);/gi;
  let am: RegExpExecArray | null;
  while ((am = alterTable.exec(sql))) {
    const table = am[1].replace(/^public\./, '');
    const body = am[2];
    alters.push(table);
    if (!createdColumns[table]) createdColumns[table] = new Set();
    Array.from(body.matchAll(/ADD COLUMN\s+"?([\w]+)"?/gi)).forEach((addCol: any) => createdColumns[table].add(addCol[1]));
    Array.from(body.matchAll(/REFERENCES\s+"?([\w\.]+)"?/gi)).forEach((ref: any) => dependsOn.add(ref[1].replace(/^public\./, "")));
  }

  for (const idx of Array.from(sql.matchAll(/CREATE (?:UNIQUE )?INDEX\s+"?[\w_]+"?\s+ON\s+"?([\w\.]+)"?\s*\(([^\)]+)\)/gi))) {
    const table = idx[1].replace(/^public\./, '');
    dependsOn.add(table);
    const cols = idx[2].replace(/"/g, '').split(',').map((s: string) => s.trim());
    for (const c of cols) {
      if (!createdColumns[table]?.has(c)) unsafeAssumptions.push(`Index references ${table}.${c} without creation in this migration`);
    }
  }

  for (const authRef of Array.from(sql.matchAll(/\bauth\.[a-zA-Z_][\w]*/g))) {
    unsafeAssumptions.push(`Supabase auth schema reference: ${authRef[0]}`);
  }

  return { name, creates, alters, dependsOn: [...dependsOn], unsafeAssumptions: [...new Set(unsafeAssumptions)], createdColumns };
}

async function introspectDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) return { available: false as const, reason: 'DATABASE_URL not set' };
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name
    `);
    const columns = await client.query(`
      SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name, ordinal_position
    `);
    const constraints = await client.query(`
      SELECT n.nspname AS schema_name, t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      ORDER BY schema_name, table_name, c.conname
    `);
    const indexes = await client.query(`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog','information_schema')
      ORDER BY schemaname, tablename, indexname
    `);
    let prismaMigrations: any[] = [];
    try {
      prismaMigrations = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at')).rows;
    } catch {
      prismaMigrations = [];
    }
    return { available: true as const, tables: tables.rows, columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, prismaMigrations };
  } finally {
    await client.end();
  }
}

function writeSchemaInventory(models: SchemaModel[]) {
  const lines: string[] = ['# Prisma Schema Inventory', ''];
  for (const model of models) {
    lines.push(`## ${model.name} -> \`${model.table}\``);
    lines.push('', '| Column | Type | Nullable | Default | Notes |', '|---|---|---|---|---|');
    for (const f of model.fields) {
      lines.push(`| ${f.mappedName ?? f.name} | ${f.type} | ${f.optional ? 'YES' : 'NO'} | ${f.defaultValue ?? ''} | ${f.isId ? 'PK' : ''} |`);
    }
    if (model.uniques.length) lines.push('', `Unique: ${model.uniques.map(u => `(${u.join(', ')})`).join(', ')}`);
    if (model.indexes.length) lines.push('', `Indexes: ${model.indexes.map(i => `(${i.join(', ')})`).join(', ')}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(docsDir, 'schema-inventory.md'), lines.join('\n'));
}

function mainMdMigrationInventory(summaries: MigrationSummary[]) {
  const lines = ['# Migration Inventory', ''];
  for (const s of summaries) {
    lines.push(`## ${s.name}`, '', `- Creates: ${s.creates.join(', ') || 'none'}`, `- Alters: ${s.alters.join(', ') || 'none'}`, `- Depends on: ${s.dependsOn.join(', ') || 'none'}`, `- Unsafe assumptions: ${s.unsafeAssumptions.join('; ') || 'none'}`, '');
  }
  fs.writeFileSync(path.join(docsDir, 'migration-inventory.md'), lines.join('\n'));
}

function writeDatabaseInventory(db: any) {
  const lines = ['# Database Inventory', ''];
  if (!db.available) {
    lines.push(`Database inspection unavailable: ${db.reason}.`);
  } else {
    lines.push('## Tables', '');
    for (const t of db.tables) lines.push(`- ${t.table_schema}.${t.table_name}`);
    lines.push('', '## Columns', '');
    for (const c of db.columns) lines.push(`- ${c.table_schema}.${c.table_name}.${c.column_name} :: ${c.data_type} null=${c.is_nullable} default=${c.column_default ?? ''}`);
    lines.push('', '## Constraints', '');
    for (const c of db.constraints) lines.push(`- ${c.schema_name}.${c.table_name}.${c.conname} (${c.contype}): ${c.definition}`);
    lines.push('', '## Indexes', '');
    for (const i of db.indexes) lines.push(`- ${i.schemaname}.${i.tablename}.${i.indexname}: ${i.indexdef}`);
    lines.push('', '## _prisma_migrations', '');
    for (const m of db.prismaMigrations) lines.push(`- ${m.migration_name} finished_at=${m.finished_at ?? ''} rolled_back_at=${m.rolled_back_at ?? ''}`);
  }
  fs.writeFileSync(path.join(docsDir, 'database-inventory.md'), lines.join('\n'));
}

(async function run() {
  const issues: Issue[] = [];
  const schema = read(schemaPath);
  const models = parseModels(schema);
  writeSchemaInventory(models);

  const migrationDirs = fs.readdirSync(migrationsDir).filter(d => fs.existsSync(path.join(migrationsDir, d, 'migration.sql'))).sort();
  const summaries: MigrationSummary[] = [];

  const createdTables = new Set<string>();
  const createdColumns: Record<string, Set<string>> = {};

  for (const dir of migrationDirs) {
    const sql = read(path.join(migrationsDir, dir, 'migration.sql'));
    const summary = parseMigration(dir, sql);
    summaries.push(summary);

    for (const t of summary.creates) {
      createdTables.add(t.replace(/"/g, ''));
      createdColumns[t] = createdColumns[t] ?? new Set();
      Array.from(summary.createdColumns[t] ?? []).forEach((c: any) => createdColumns[t].add(c));
    }
    for (const [table, cols] of Object.entries(summary.createdColumns)) {
      createdColumns[table] = createdColumns[table] ?? new Set();
      cols.forEach(c => createdColumns[table].add(c));
    }

    for (const dep of summary.dependsOn) {
      if (!createdTables.has(dep)) {
        issues.push({ severity: 'critical', code: 'MIGRATION_TABLE_ORDER', message: `${dir} depends on table ${dep} before creation`, source: dir });
      }
    }
    for (const unsafe of summary.unsafeAssumptions) {
      const sev: Severity = unsafe.includes('auth.') ? 'warning' : 'critical';
      issues.push({ severity: sev, code: unsafe.includes('auth.') ? 'SHADOW_AUTH' : 'UNSAFE_ASSUMPTION', message: unsafe, source: dir });
    }
  }

  mainMdMigrationInventory(summaries);

  const schemaTables = new Set(models.map(m => m.table));
  Array.from(schemaTables).forEach((table) => {
    if (!createdTables.has(table)) {
      issues.push({ severity: 'critical', code: 'SCHEMA_TABLE_MISSING_FROM_MIGRATIONS', message: `Table ${table} present in schema but never created in migrations` });
    }
  });

  const db = await introspectDatabase();
  writeDatabaseInventory(db);

  if (db.available) {
    const dbTables = new Set(db.tables.map((t: any) => t.table_name));
    Array.from(schemaTables).forEach((table) => { if (!dbTables.has(table)) issues.push({ severity: 'critical', code: 'SCHEMA_TABLE_MISSING_FROM_DB', message: `Table ${table} missing in database` }); });
    Array.from(createdTables).forEach((table) => { if (!dbTables.has(table)) issues.push({ severity: 'warning', code: 'MIGRATION_TABLE_MISSING_FROM_DB', message: `Table ${table} from migrations missing in database` }); });
    Array.from(dbTables).forEach((table: any) => { if (!schemaTables.has(table)) issues.push({ severity: 'info', code: 'DB_EXTRA_TABLE', message: `Table ${table} exists in DB but not schema` }); });
  } else {
    issues.push({ severity: 'warning', code: 'DB_UNAVAILABLE', message: db.reason });
  }

  const linesDiff = ['# Schema / Migration / DB Diff', ''];
  for (const i of issues) linesDiff.push(`- **${i.severity}** [${i.code}] ${i.message}${i.source ? ` (source: ${i.source})` : ''}`);
  fs.writeFileSync(path.join(docsDir, 'schema-migration-db-diff.md'), linesDiff.join('\n'));

  const orderLines = ['# Migration Ordering Violations', '', ...issues.filter(i => i.code.includes('ORDER') || i.code === 'UNSAFE_ASSUMPTION' || i.code === 'SHADOW_AUTH').map(i => `- **${i.severity}** ${i.message}${i.source ? ` (${i.source})` : ''}`)];
  fs.writeFileSync(path.join(docsDir, 'migration-ordering-violations.md'), orderLines.join('\n'));

  const repair = `# Migration Repair Plan

1. Add a foundational migration that creates missing tables before dependent migrations, starting with \`reservation_nights\` and any other tables reported as SCHEMA_TABLE_MISSING_FROM_MIGRATIONS.
2. For each ordering violation, either (a) move the SQL into a later migration, or (b) add prerequisite create/add-column statements in an earlier migration.
3. For Supabase \`auth.*\` dependencies, gate them with existence checks or separate out into non-Prisma SQL bootstrap steps to keep shadow DB safe.
4. In already-deployed environments, do not rewrite applied migrations; create forward-fix migrations and mark history with \`prisma migrate resolve\` only when schema state is manually verified.
5. Validate with:\n   - npx prisma migrate status\n   - npx prisma migrate deploy\n   - npm run audit:migrations\n
## Commands for current environment

\`npm run audit:migrations\`\n\`npx prisma migrate status\`\n\`npx prisma migrate deploy\`\n`;
  fs.writeFileSync(path.join(docsDir, 'migration-repair-plan.md'), repair);

  const reportJson = { generatedAt: new Date().toISOString(), issues, migrations: summaries.map(s => ({ ...s, createdColumns: Object.fromEntries(Object.entries(s.createdColumns).map(([k,v]) => [k, Array.from(v as Set<string>)])) })), dbAvailable: db.available };
  fs.writeFileSync(path.join(reportsDir, 'migration-audit.json'), JSON.stringify(reportJson, null, 2));

  const md = ['# Migration Audit Report', '', `Generated: ${reportJson.generatedAt}`, '', '## Findings', ...issues.map(i => `- **${i.severity}** [${i.code}] ${i.message}`), ''];
  fs.writeFileSync(path.join(reportsDir, 'migration-audit.md'), md.join('\n'));

  console.log(`Audit complete. Issues: ${issues.length}`);
})();
