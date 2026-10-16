import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Versioned forward-only migrations. Deploys never reset or recreate application data.
export async function applyMigrations(sql, directory = resolve('migrations')) {
  await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(hashtext('revo_schema_migrations'))"),
    sql.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  ]);
  const verified = [];
  for (const name of (await readdir(directory)).filter((n) => /^[a-z0-9_]+\.sql$/.test(n)).sort()) {
    const source = await readFile(resolve(directory, name), 'utf8');
    // Keep SQL intact: splitting on semicolons corrupts comments and procedural SQL.
    await sql.transaction([
      sql.query("SELECT pg_advisory_xact_lock(hashtext('revo_schema_migrations'))"),
      sql.query(`DO $revo_migration$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name='${name}') THEN
          ${source}
          INSERT INTO schema_migrations(name) VALUES ('${name}');
        END IF;
      END $revo_migration$;`)
    ]);
    verified.push(name);
  }
  return verified;
}
