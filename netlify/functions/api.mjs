import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { authorizeMutation, CREDENTIAL_PATTERN, hashCredential } from './lib/security.mjs';
import { cleanFaction, cleanMember, cleanText, normalizeName, validStatus, validUuid } from './lib/validation.mjs';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const routeOf = (event) => (event.path || '').replace(/^.*\/api\/?/, '').replace(/^\/+|\/+$/g, '') || 'overview';
const getIp = (event) => event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for']?.split(',')[0]?.trim();

async function readData(sql, route) {
  if (route === 'factions') return sql.query(`SELECT f.*, COALESCE(json_agg(m ORDER BY m.role, m.name) FILTER (WHERE m.id IS NOT NULL), '[]') AS members FROM organization_factions f LEFT JOIN organization_faction_members m ON m.faction_id=f.id GROUP BY f.id ORDER BY f.status, f.name`);
  if (route === 'blacklist') return sql.query("SELECT * FROM external_relations WHERE relation_type='blacklist' ORDER BY name");
  if (route === 'allies') return sql.query("SELECT * FROM external_relations WHERE relation_type='official_ally' ORDER BY name");
  if (route === 'audit') return sql.query('SELECT id, operation, entity_type, entity_id, previous_value, new_value, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100');
  return { factions: await readData(sql, 'factions'), blacklist: await readData(sql, 'blacklist'), allies: await readData(sql, 'allies') };
}

const auditQuery = (operation, entity, id, before, after, ipHash) => ({ text: 'INSERT INTO audit_logs(operation, entity_type, entity_id, previous_value, new_value, actor_ip_hash) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)', params: [operation, entity, id, JSON.stringify(before), JSON.stringify(after), ipHash] });

async function mutate(sql, route, payload, ipHash) {
  const { action, data = {}, id } = payload;
  if (route === 'credential' && action === 'change') {
    if (!CREDENTIAL_PATTERN.test(data.newCredential || '') || data.newCredential !== data.confirmCredential) return json(400, { error: 'A nova credencial deve conter exatamente 6 dígitos e coincidir com a confirmação.' });
    const next = hashCredential(data.newCredential);
    await sql.transaction([
      sql.query("UPDATE app_security_settings SET value=$1, updated_at=now() WHERE key='action_credential_hash'", [next]),
      sql.query(...Object.values(auditQuery('CREDENTIAL_CHANGE', 'security', 'action_credential', null, { changed: true }, ipHash)))
    ]);
    return json(200, { ok: true });
  }

  if (route === 'factions') {
    if (action === 'create') {
      const value = cleanFaction(data); if (!value) return json(400, { error: 'Dados da FAC inválidos.' });
      const newRecord = { id: randomUUID(), ...value };
      const audit = auditQuery('FACTION_ADD', 'organization_faction', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([sql.query('INSERT INTO organization_factions(id,name,normalized_name,logo_url,status,notes) VALUES($1,$2,$3,$4,$5,$6)', [newRecord.id, ...Object.values(value)]), sql.query(audit.text, audit.params)]);
      return json(201, newRecord);
    }
    if (!validUuid(id)) return json(400, { error: 'Identificador inválido.' });
    const before = await sql.query('SELECT * FROM organization_factions WHERE id=$1', [id]); if (!before.length) return json(404, { error: 'FAC não encontrada.' });
    if (action === 'delete') {
      await sql.transaction([sql.query('DELETE FROM organization_factions WHERE id=$1', [id]), sql.query(...Object.values(auditQuery('FACTION_DELETE', 'organization_faction', id, before[0], null, ipHash)))]);
      return json(200, { ok: true });
    }
    const value = cleanFaction(data); if (!value) return json(400, { error: 'Dados da FAC inválidos.' });
    const next = { ...before[0], ...value };
    const audit = auditQuery('FACTION_UPDATE', 'organization_faction', id, before[0], next, ipHash);
    await sql.transaction([sql.query('UPDATE organization_factions SET name=$1,normalized_name=$2,logo_url=$3,status=$4,notes=$5,updated_at=now() WHERE id=$6', [...Object.values(value), id]), sql.query(audit.text, audit.params)]);
    return json(200, next);
  }

  if (route === 'members') {
    if (action === 'create') {
      if (!validUuid(data.factionId)) return json(400, { error: 'FAC inválida.' });
      const value = cleanMember(data); if (!value) return json(400, { error: 'Dados do responsável inválidos.' });
      const newRecord = { id: randomUUID(), factionId: data.factionId, ...value };
      const audit = auditQuery('MEMBER_ADD', 'organization_faction_member', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([sql.query('INSERT INTO organization_faction_members(id,faction_id,name,role,whatsapp,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7)', [newRecord.id, data.factionId, ...Object.values(value)]), sql.query(audit.text, audit.params)]);
      return json(201, newRecord);
    }
    if (!validUuid(id)) return json(400, { error: 'Identificador inválido.' });
    const before = await sql.query('SELECT * FROM organization_faction_members WHERE id=$1', [id]); if (!before.length) return json(404, { error: 'Responsável não encontrado.' });
    if (action === 'delete') {
      await sql.transaction([sql.query('DELETE FROM organization_faction_members WHERE id=$1', [id]), sql.query(...Object.values(auditQuery('MEMBER_DELETE', 'organization_faction_member', id, before[0], null, ipHash)))]);
      return json(200, { ok: true });
    }
    const value = cleanMember(data); if (!value) return json(400, { error: 'Dados do responsável inválidos.' });
    const next = { ...before[0], ...value };
    const audit = auditQuery('MEMBER_UPDATE', 'organization_faction_member', id, before[0], next, ipHash);
    await sql.transaction([sql.query('UPDATE organization_faction_members SET name=$1,role=$2,whatsapp=$3,status=$4,notes=$5,updated_at=now() WHERE id=$6', [...Object.values(value), id]), sql.query(audit.text, audit.params)]);
    return json(200, next);
  }

  if (route === 'blacklist' || route === 'allies') {
    const type = route === 'blacklist' ? 'blacklist' : 'official_ally';
    if (action === 'create') {
      const name = cleanText(data.name, 100); if (!name || !validStatus(data.status || 'active')) return json(400, { error: 'Dados inválidos.' });
      const newRecord = { id: randomUUID(), name, normalizedName: normalizeName(name), relationType: type, status: data.status || 'active', notes: cleanText(data.notes) || null };
      const audit = auditQuery(`${type.toUpperCase()}_ADD`, 'external_relation', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([sql.query('INSERT INTO external_relations(id,name,normalized_name,relation_type,status,notes) VALUES($1,$2,$3,$4,$5,$6)', Object.values(newRecord)), sql.query(audit.text, audit.params)]);
      return json(201, newRecord);
    }
    if (!validUuid(id)) return json(400, { error: 'Identificador inválido.' });
    const before = await sql.query('SELECT * FROM external_relations WHERE id=$1 AND relation_type=$2', [id, type]); if (!before.length) return json(404, { error: 'Registro não encontrado.' });
    if (action === 'delete') {
      await sql.transaction([sql.query('DELETE FROM external_relations WHERE id=$1', [id]), sql.query(...Object.values(auditQuery(`${type.toUpperCase()}_DELETE`, 'external_relation', id, before[0], null, ipHash)))]);
      return json(200, { ok: true });
    }
    const name = cleanText(data.name, 100); if (!name || !validStatus(data.status)) return json(400, { error: 'Dados inválidos.' });
    const next = { ...before[0], name, normalized_name: normalizeName(name), status: data.status, notes: cleanText(data.notes) || null };
    const audit = auditQuery(`${type.toUpperCase()}_UPDATE`, 'external_relation', id, before[0], next, ipHash);
    await sql.transaction([sql.query('UPDATE external_relations SET name=$1,normalized_name=$2,status=$3,notes=$4,updated_at=now() WHERE id=$5', [name, normalizeName(name), data.status, cleanText(data.notes) || null, id]), sql.query(audit.text, audit.params)]);
    return json(200, next);
  }
  return json(404, { error: 'Recurso não encontrado.' });
}

export const handler = async (event) => {
  if (!process.env.DATABASE_URL) return json(503, { error: 'Banco de dados não configurado.' });
  const sql = neon(process.env.DATABASE_URL);
  const route = routeOf(event);
  try {
    if (event.httpMethod === 'GET') return json(200, await readData(sql, route));
    if (!['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) return json(405, { error: 'Método não permitido.' });
    const payload = JSON.parse(event.body || '{}');
    const auth = await authorizeMutation({ sql, credential: payload.credential, ip: getIp(event), bootstrapCredential: process.env.ADMIN_ACTION_CREDENTIAL });
    if (!auth.ok) return json(auth.status, { error: auth.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Credencial inválida.' });
    return await mutate(sql, route, payload, auth.ipHash);
  } catch (error) {
    console.error(JSON.stringify({ event: 'api_error', route, message: error.message }));
    if (error.code === '23505') return json(409, { error: 'Já existe um registro com esse nome.' });
    return json(500, { error: 'Não foi possível concluir a operação.' });
  }
};
