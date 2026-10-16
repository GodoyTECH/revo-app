import { neon } from '@neondatabase/serverless';
import { applyMigrations } from './lib/migrations.mjs';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
try {
  await applyMigrations(neon(process.env.DATABASE_URL));
  console.log('Migrations verificadas: somente versões pendentes foram aplicadas. Dados preservados.');
} catch (error) {
  console.error('Falha nas migrations. Confira conexão, permissões e logs privados do banco. Código:', error.code || 'indisponível');
  process.exitCode = 1;
}
