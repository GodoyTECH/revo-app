import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
test('Netlify build ships local OCR and fingerprints every immutable JS/CSS asset',async()=>{
 await promisify(execFile)(process.execPath,['scripts/build.mjs']);
 const html=await readFile('dist/index.html','utf8');const assets=await readdir('dist/assets');
 for(const name of assets){const body=await readFile('dist/assets/'+name,'utf8');const hash=createHash('sha256').update(body).digest('hex').slice(0,10);assert.ok(name.includes('-'+hash+'.'),name);
  if(name.endsWith('.js')) for(const match of body.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {assert.ok(assets.includes(match[1]),match[1]);assert.match(match[1],/-[a-f0-9]{10}\.js$/);}
 }
 assert.match(html,/<link rel="stylesheet" href="\/assets\/styles-[a-f0-9]+\.css"/);
 assert.doesNotMatch(html,/<script[^>]+\.css/);
 for(const path of ['tesseract/tesseract.esm.min.js','tesseract/worker.min.js','tesseract-core/tesseract-core-lstm.wasm.js','tessdata/por.traineddata.gz'])await access('dist/vendor/'+path);
});
test('Netlify deploy runs guarded migrations and requires server-only database configuration',async()=>{
 const {spawnSync}=await import('node:child_process');const toml=await readFile('netlify.toml','utf8');assert.match(toml,/command = "npm run build:netlify"/);
 const result=spawnSync(process.execPath,['scripts/netlify-build.mjs'],{env:{...process.env,DATABASE_URL:''},encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Builds e Functions/);assert.doesNotMatch(result.stderr,/postgres(?:ql)?:\/\//);
});
