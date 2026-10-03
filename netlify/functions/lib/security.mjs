import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const CREDENTIAL_PATTERN = /^\d{6}$/;

export function hashCredential(credential, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(credential, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyCredential(credential, stored) {
  if (!CREDENTIAL_PATTERN.test(credential || '') || !stored?.startsWith('scrypt:')) return false;
  const [, salt, expectedHex] = stored.split(':');
  const actual = scryptSync(credential, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const hashIp = (ip) => createHash('sha256').update(ip || 'unknown').digest('hex');

export async function authorizeMutation({ sql, credential, ip, bootstrapCredential }) {
  if (!CREDENTIAL_PATTERN.test(credential || '')) return { ok: false, status: 401 };
  const ipHash = hashIp(ip);
  const recent = await sql.query(
    `SELECT count(*)::int AS count FROM credential_attempts
     WHERE ip_hash = $1 AND success = false AND created_at > now() - interval '15 minutes'`, [ipHash]
  );
  if (recent[0].count >= 5) return { ok: false, status: 429 };

  const rows = await sql.query("SELECT value FROM app_security_settings WHERE key = 'action_credential_hash'");
  let valid = rows.length
    ? verifyCredential(credential, rows[0].value)
    : CREDENTIAL_PATTERN.test(bootstrapCredential || '') && credential === bootstrapCredential;

  await sql.query('INSERT INTO credential_attempts(ip_hash, success) VALUES ($1, $2)', [ipHash, valid]);
  if (!valid) {
    console.warn(JSON.stringify({ event: 'invalid_credential', ipHash, at: new Date().toISOString() }));
    return { ok: false, status: 401 };
  }
  if (!rows.length) {
    await sql.query(
      `INSERT INTO app_security_settings(key, value) VALUES ('action_credential_hash', $1)
       ON CONFLICT (key) DO NOTHING`, [hashCredential(credential)]
    );
  }
  return { ok: true, ipHash };
}
