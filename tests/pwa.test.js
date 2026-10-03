import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('manifest identifies the app and exposes install icons', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'Organização Revolucionários App');
  assert.equal(manifest.short_name, 'Revolucionários');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  await Promise.all(manifest.icons.map((icon) => access(`public${icon.src}`)));
});

test('home and install flow use the official root logo', async () => {
  const [html, script] = await Promise.all([readFile('index.html', 'utf8'), readFile('src/main.js', 'utf8')]);
  assert.match(html, /src="\/logo\.png"/);
  assert.match(html, /Organização <em>Revolucionários<\/em> App/);
  assert.match(html, /INSTALAR APP/);
  assert.match(script, /beforeinstallprompt/);
  assert.match(script, /Adicionar à Tela de Início/);
});
