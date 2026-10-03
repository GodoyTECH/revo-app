import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const expected = ['00 NOIS MERMO','FML BLOODS','TROPA DO CORONEL','VOVÓ METRALHA','DESTRUIÇÃO','AFRICA DO SUL','COMANDO CAVEIRA','MILICIA PRIME','BELLADONA'];

test('incremental migration models unlimited FAC members and audit/security data', async () => {
  const sql = await readFile('migrations/001_organization_factions.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS organization_factions/);
  assert.match(sql, /organization_faction_members/);
  assert.match(sql, /REFERENCES organization_factions\(id\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS audit_logs/);
  assert.match(sql, /ON CONFLICT \(normalized_name, relation_type\) DO NOTHING/);
});

test('protected API combines mutations and audit writes in transactions', async () => {
  const source = await readFile('netlify/functions/api.mjs', 'utf8');
  assert.match(source, /authorizeMutation/);
  assert.match(source, /sql\.transaction/);
  assert.match(source, /auditQuery\('FACTION_ADD'/);
  assert.match(source, /auditQuery\('MEMBER_ADD'/);
});

test('Blacklist seed contains exactly the nine official entries', async () => {
  const sql = await readFile('migrations/001_organization_factions.sql', 'utf8');
  const seed = [...sql.matchAll(/\('([^']+)', '[^']+', 'blacklist'\)/g)].map((match) => match[1]);
  assert.deepEqual(seed, expected);
  assert.equal(new Set(seed).size, 9);
});
