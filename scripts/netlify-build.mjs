import { spawnSync } from 'node:child_process';
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL precisa estar configurada no Netlify para os escopos Builds e Functions. Não é necessário colar SQL manualmente.');
  process.exit(1);
}
for (const script of ['scripts/migrate.mjs', 'scripts/generate-icons.mjs', 'scripts/build.mjs']) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
