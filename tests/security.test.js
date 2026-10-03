import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCredential, verifyCredential, authorizeMutation } from '../netlify/functions/lib/security.mjs';
import { normalizeWhatsapp, cleanMember } from '../netlify/functions/lib/validation.mjs';

const fakeSql = ({ stored = null, failures = 0 } = {}) => ({
  async query(text) {
    if (text.includes('count(*)')) return [{ count: failures }];
    if (text.includes('SELECT value')) return stored ? [{ value: stored }] : [];
    return [];
  }
});

test('credential is hashed with scrypt and never stored as plaintext', () => {
  const hash = hashCredential('654321');
  assert.match(hash, /^scrypt:/);
  assert.ok(!hash.includes('654321'));
  assert.equal(verifyCredential('654321', hash), true);
  assert.equal(verifyCredential('000000', hash), false);
});

test('missing, malformed and incorrect credentials are rejected', async () => {
  const stored = hashCredential('654321');
  for (const credential of [undefined, '', '12345', '1234567', 'abcdef', '000000']) {
    const result = await authorizeMutation({ sql: fakeSql({ stored }), credential, ip: '127.0.0.1' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  }
});

test('excessive attempts are rate limited', async () => {
  const result = await authorizeMutation({ sql: fakeSql({ stored: hashCredential('654321'), failures: 5 }), credential: '654321', ip: '127.0.0.1' });
  assert.deepEqual(result, { ok: false, status: 429 });
});

test('WhatsApp accepts only normalized safe phone numbers', () => {
  assert.equal(normalizeWhatsapp('+55 (11) 99999-9999'), '+5511999999999');
  assert.equal(normalizeWhatsapp('javascript:alert(1)'), null);
  assert.equal(cleanMember({ name: 'Pessoa', role: '00', whatsapp: '<script>', status: 'active' }), null);
});
