import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const hash = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 10);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('logo.png', 'dist/logo.png');
const [sourceHtml, sourceJs, sourceCss, sourceOcr, diplomacy, gallery] = await Promise.all([
  readFile('index.html', 'utf8'), readFile('src/main.js', 'utf8'), readFile('src/styles.css', 'utf8'),
  readFile('src/ocr-provider.js', 'utf8'), readFile('src/diplomacy.js','utf8'), readFile('src/gallery.js','utf8')
]);
// Every imported module must change URL with its contents under immutable /assets caching.
const galleryName = `gallery-${hash(gallery)}.js`, diplomacyName = `diplomacy-${hash(diplomacy)}.js`;
const ocr = sourceOcr.replace('./gallery.js', `./${galleryName}`), ocrName = `ocr-provider-${hash(ocr)}.js`;
const js = sourceJs.replace('./gallery.js', `./${galleryName}`).replace('./diplomacy.js', `./${diplomacyName}`).replace('./ocr-provider.js', `./${ocrName}`);
const jsName = `main-${hash(js)}.js`, cssName = `styles-${hash(sourceCss)}.css`;
await Promise.all([
  writeFile(`dist/assets/${jsName}`, js), writeFile(`dist/assets/${cssName}`, sourceCss),
  writeFile(`dist/assets/${ocrName}`, ocr), writeFile(`dist/assets/${galleryName}`, gallery),
  writeFile(`dist/assets/${diplomacyName}`, diplomacy),
  writeFile('dist/index.html', sourceHtml.replace('/src/main.js', `/assets/${jsName}`).replace('/src/styles.css', `/assets/${cssName}`))
]);
// Engine, worker, WASM and language are served locally; images never leave the browser.
await mkdir('dist/vendor/tesseract', { recursive: true });
await mkdir('dist/vendor/tessdata', { recursive: true });
await cp('node_modules/tesseract.js/dist/tesseract.esm.min.js', 'dist/vendor/tesseract/tesseract.esm.min.js');
await cp('node_modules/tesseract.js/dist/worker.min.js', 'dist/vendor/tesseract/worker.min.js');
await cp('node_modules/tesseract.js-core', 'dist/vendor/tesseract-core', { recursive: true });
await cp('node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'dist/vendor/tessdata/por.traineddata.gz');
const assets = await readdir('dist/assets');
if (![jsName, cssName, ocrName, galleryName, diplomacyName].every((name) => assets.includes(name))) throw new Error('Falha ao gerar os assets do frontend.');
console.log(`Build concluído: ${assets.length} assets versionados e OCR local em dist/vendor.`);
