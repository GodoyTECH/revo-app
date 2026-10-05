import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const hash = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 10);

await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('logo.png', 'dist/logo.png');

const [sourceHtml, sourceJs, sourceCss, ocrProvider] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('src/main.js', 'utf8'),
  readFile('src/styles.css', 'utf8'),
  readFile('src/ocr-provider.js', 'utf8'),
]);
const jsName = `main-${hash(sourceJs)}.js`;
const cssName = `styles-${hash(sourceCss)}.css`;
const html = sourceHtml
  .replace('/src/main.js', `/assets/${jsName}`)
  .replace('/src/styles.css', `/assets/${cssName}`);

await Promise.all([
  writeFile(`dist/assets/${jsName}`, sourceJs),
  writeFile(`dist/assets/${cssName}`, sourceCss),
  writeFile('dist/assets/ocr-provider.js', ocrProvider),
  writeFile('dist/index.html', html),
]);

const assets = await readdir('dist/assets');
if (!assets.includes(jsName) || !assets.includes(cssName) || !assets.includes('ocr-provider.js')) throw new Error('Falha ao gerar os assets do frontend.');
console.log(`Build concluído: dist/assets/${jsName} e dist/assets/${cssName}`);
