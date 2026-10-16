import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const hash = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 10);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('logo.png', 'dist/logo.png');
const [sourceHtml, sourceCss] = await Promise.all([readFile('index.html','utf8'),readFile('src/styles.css','utf8')]);
const names = new Map();
for (const module of ['names','gallery','ocr-layout','ocr-provider','review','crop','diplomacy','main']) {
  let source = await readFile(`src/${module}.js`,'utf8');
  for (const [dependency, name] of names) source = source.replaceAll(`./${dependency}.js`, `./${name}`);
  const name = `${module}-${hash(source)}.js`; names.set(module, name);
  await writeFile(`dist/assets/${name}`, source);
}
const cssName = `styles-${hash(sourceCss)}.css`;
await writeFile(`dist/assets/${cssName}`,sourceCss);
await writeFile('dist/index.html',sourceHtml.replace('/src/main.js',`/assets/${names.get('main')}`).replace('/src/styles.css',`/assets/${cssName}`));
// Engine, worker, WASM and language are served locally; images never leave the browser.
await mkdir('dist/vendor/tesseract', { recursive: true });
await mkdir('dist/vendor/tessdata', { recursive: true });
await cp('node_modules/tesseract.js/dist/tesseract.esm.min.js', 'dist/vendor/tesseract/tesseract.esm.min.js');
await cp('node_modules/tesseract.js/dist/worker.min.js', 'dist/vendor/tesseract/worker.min.js');
await cp('node_modules/tesseract.js-core', 'dist/vendor/tesseract-core', { recursive: true });
await cp('node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'dist/vendor/tessdata/por.traineddata.gz');
const assets = await readdir('dist/assets');
if (![...names.values(), cssName].every((name) => assets.includes(name))) throw new Error('Falha ao gerar os assets do frontend.');
console.log(`Build concluído: ${assets.length} assets versionados e OCR local em dist/vendor.`);
