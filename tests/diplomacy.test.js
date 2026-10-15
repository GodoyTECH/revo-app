import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanDiplomacySubmission, normalizeName } from '../netlify/functions/lib/validation.mjs';

const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

test('name normalization merges controlled punctuation, spaces and accents', () => {
  assert.equal(normalizeName('  Goddoy R.K '), 'GODDOY R K');
  assert.equal(normalizeName('Goddoy   R K'), 'GODDOY R K');
  assert.equal(normalizeName('África do Sul'), 'AFRICA DO SUL');
});

test('public OCR submission is bounded and accepts reviewed ally/enemy data', () => {
  const valid = cleanDiplomacySubmission({ sourceFactionId: uuid, relationType: 'ENEMY', importMode: 'COMPLETE', entries: [{ name: 'FAC X', originalText: 'FAC X', confidence: 98 }], images: [{ fileName: 'print.webp', mimeType: 'image/webp', sha256: hash, rawText: 'FAC X' }] });
  assert.equal(valid.entries[0].name, 'FAC X');
  assert.equal(cleanDiplomacySubmission({ ...valid, sourceFactionId: 'texto-solto' }), null);
  assert.equal(cleanDiplomacySubmission({ ...valid, images: Array(6).fill(valid.images[0]) }), null);
});

test('diplomacy migration keeps ally, enemy and blacklist concepts separate', async () => {
  const sql = await readFile('migrations/002_diplomacy_ocr.sql', 'utf8');
  for (const table of ['gangs', 'gang_aliases', 'diplomacy_snapshots', 'diplomacy_entries', 'submission_images', 'ocr_results']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql, /relation_type IN \('ALLY','ENEMY'\)/);
  assert.match(sql, /sha256/);
  assert.doesNotMatch(sql, /godoy_(allies|enemies)/i);
});
