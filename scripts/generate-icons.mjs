import { access, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'logo.png');
const icons = resolve(root, 'public/icons');

try {
  await access(source);
} catch {
  throw new Error('logo.png não foi encontrada na raiz. Adicione a logo oficial antes de executar o app.');
}

await mkdir(icons, { recursive: true });
const assets = [
  'favicon.ico',
  'favicon.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'maskable-icon-192.png',
  'maskable-icon-512.png'
];

// Mantém os derivados byte a byte fiéis ao arquivo oficial. Plataformas PWA
// redimensionam a imagem quadrada para o slot solicitado pelo manifest.
await Promise.all(assets.map((name) => copyFile(source, resolve(icons, name))));
console.log(`Ícones preparados a partir de ${source}`);
