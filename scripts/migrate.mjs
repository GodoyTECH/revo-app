import { readFile, readdir } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const sql = neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;

for (const name of (await readdir('migrations')).filter((file) => file.endsWith('.sql')).sort()) {
  const applied = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
  if (applied.length) continue;
  const source = await readFile(`migrations/${name}`, 'utf8');
  const statements = source
    .split(';')
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  await sql.transaction([...statements.map((statement) => sql.query(statement)), sql`INSERT INTO schema_migrations(name) VALUES (${name})`]);
  console.log(`Migration aplicada: ${name}`);
}
