import { neon } from '@neondatabase/serverless';
import { consolidate } from '../../src/diplomacy.js';
import { randomUUID } from 'node:crypto';
import { authorizeMutation, CREDENTIAL_PATTERN, hashCredential, hashIp } from './lib/security.mjs';
import { cleanDiplomacySubmission, cleanFaction, cleanMember, cleanText, normalizeName, validStatus, validUuid } from './lib/validation.mjs';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const routeOf = (event) => (event.path || '').replace(/^.*\/api\/?/, '').replace(/^\/+|\/+$/g, '') || 'overview';
const getIp = (event) => event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for']?.split(',')[0]?.trim();

export async function readData(sql, route) {
  if (route === 'factions') return sql.query(`SELECT f.*, COALESCE(json_agg(m ORDER BY m.role, m.name) FILTER (WHERE m.id IS NOT NULL), '[]') AS members FROM organization_factions f LEFT JOIN organization_faction_members m ON m.faction_id=f.id GROUP BY f.id ORDER BY f.status, f.name`);
  if (route === 'blacklist') return sql.query("SELECT * FROM external_relations WHERE relation_type='blacklist' ORDER BY name");
  if (route === 'allies') return sql.query("SELECT * FROM external_relations WHERE relation_type='official_ally' ORDER BY name");
  if (route === 'audit') return sql.query('SELECT id, operation, entity_type, entity_id, previous_value, new_value, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100');
  if (route === 'diplomacy') {
    const catalog = await sql.query("SELECT g.id,g.canonical_name AS name,COALESCE(json_agg(a.alias) FILTER(WHERE a.id IS NOT NULL),'[]') AS aliases FROM gangs g LEFT JOIN gang_aliases a ON a.gang_id=g.id GROUP BY g.id ORDER BY g.canonical_name");
    const history = await sql.query(`SELECT s.*,s.confirmed_at::text AS confirmed_at,s.created_at::text AS created_at,f.name AS source_name,
      COALESCE(json_agg(jsonb_build_object('id',e.id,'target_gang_id',e.target_gang_id,'name',g.canonical_name,'reviewed_name',e.reviewed_name,'originalText',e.ocr_original_text,'confidence',e.ocr_confidence,'provenance',e.review_provenance)) FILTER(WHERE e.id IS NOT NULL),'[]') AS entries
      FROM diplomacy_snapshots s JOIN organization_factions f ON f.id=s.source_faction_id
      LEFT JOIN diplomacy_entries e ON e.snapshot_id=s.id LEFT JOIN gangs g ON g.id=e.target_gang_id
      GROUP BY s.id,f.name ORDER BY s.confirmed_at DESC NULLS LAST,s.created_at DESC,s.id DESC`);
    const factions = await readData(sql, 'factions'), blacklist = await readData(sql, 'blacklist');
    return { gangs: consolidate({ factions, blacklist, snapshots: history, catalog }), history, catalog };
  }
  return { factions: await readData(sql, 'factions'), blacklist: await readData(sql, 'blacklist'), allies: await readData(sql, 'allies') };
}

export async function submitDiplomacy(sql, body, ipHash) {
  const data = cleanDiplomacySubmission(body);
  if (!data) return json(400, { error: 'Envio inválido: confirme os nomes e respeite os limites. Imagens não são aceitas.' });
  const source = await sql.query("SELECT id FROM organization_factions WHERE id=$1 AND status='active'", [data.sourceFactionId]);
  if (!source.length) return json(400, { error: 'FAC de origem inválida ou inativa.' });
  const catalog = await sql.query('SELECT g.id,g.normalized_name,a.normalized_alias FROM gangs g LEFT JOIN gang_aliases a ON a.gang_id=g.id');
  const resolved = new Map();
  for (const entry of data.entries) {
    const normalized = normalizeName(entry.name);
    const match = catalog.find((g) => g.normalized_name === normalized || g.normalized_alias === normalized);
    if (entry.gangId && (!match || match.id !== entry.gangId)) return json(400, { error: 'Correspondência alterada. Revise o nome novamente.' });
    const key = match?.id || normalized;
    if (!resolved.has(key)) resolved.set(key, { id: match?.id, normalized, entries: [] });
    resolved.get(key).entries.push(entry);
  }
  const snapshotId = randomUUID();
  // Lock one source/type during submission; all writes and the audit commit together.
  const queries = [sql.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.sourceFactionId + data.relationType]),
    sql.query("INSERT INTO diplomacy_snapshots(id,source_faction_id,relation_type,import_mode,status,confirmed_at,input_source) VALUES($1,$2,$3,$4,'CONFIRMED',clock_timestamp(),$5)", [snapshotId, data.sourceFactionId, data.relationType, data.importMode, data.inputSource])];
  for (const item of resolved.values()) {
    const entry = item.entries[0];
    if (!item.id) queries.push(sql.query('INSERT INTO gangs(canonical_name,normalized_name) VALUES($1,$2) ON CONFLICT(normalized_name) DO UPDATE SET updated_at=now()', [entry.name, item.normalized]));
    queries.push(sql.query(`INSERT INTO diplomacy_entries(snapshot_id,target_gang_id,ocr_original_text,ocr_confidence,reviewed_name,review_provenance)
      SELECT $1,id,$3,$4,$5,$6::jsonb FROM gangs WHERE ${item.id ? 'id=$2::uuid' : 'normalized_name=$2'} ON CONFLICT(snapshot_id,target_gang_id) DO NOTHING`,
      [snapshotId, item.id || item.normalized, entry.originalText, entry.confidence, entry.name, JSON.stringify(item.entries)]));
  }
  queries.push(sql.query("INSERT INTO audit_logs(operation,entity_type,entity_id,new_value,actor_ip_hash) VALUES('DIPLOMACY_CONFIRM','diplomacy_snapshot',$1,$2::jsonb,$3)", [snapshotId, JSON.stringify({ sourceFactionId: data.sourceFactionId, relationType: data.relationType, entries: resolved.size, inputSource: data.inputSource }), ipHash]));
  await sql.transaction(queries);
  return json(201, { id: snapshotId, entries: resolved.size });
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
    if (action === 'promote') {
      if (!validUuid(data.gangId)) return json(400, { error: 'Gangue inválida.' });
      const gang = await sql.query('SELECT * FROM gangs WHERE id=$1', [data.gangId]); if (!gang.length) return json(404, { error: 'Gangue não encontrada.' });
      const newRecord = { id: randomUUID(), gangId: data.gangId, name: gang[0].canonical_name };
      const audit = auditQuery('FACTION_PROMOTE', 'organization_faction', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([sql.query("INSERT INTO organization_factions(id,gang_id,name,normalized_name,status) VALUES($1,$2,$3,$4,'active')", [newRecord.id, data.gangId, gang[0].canonical_name, gang[0].normalized_name]), sql.query(audit.text, audit.params)]);
      return json(201, newRecord);
    }
    if (action === 'create') {
      const value = cleanFaction(data); if (!value) return json(400, { error: 'Dados da FAC inválidos.' });
      const newRecord = { id: randomUUID(), ...value };
      const audit = auditQuery('FACTION_ADD', 'organization_faction', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([
        sql.query('INSERT INTO gangs(canonical_name,normalized_name) VALUES($1,$2) ON CONFLICT(normalized_name) DO NOTHING', [value.name,value.normalizedName]),
        sql.query('INSERT INTO organization_factions(id,name,normalized_name,logo_url,status,notes,gang_id) SELECT $1,$2,$3,$4,$5,$6,id FROM gangs WHERE normalized_name=$3', [newRecord.id, ...Object.values(value)]), sql.query(audit.text, audit.params)]);
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
    if (action === 'promote' && type === 'blacklist') {
      if (!validUuid(data.gangId)) return json(400, { error: 'Gangue inválida.' });
      const gang = await sql.query('SELECT * FROM gangs WHERE id=$1', [data.gangId]); if (!gang.length) return json(404, { error: 'Gangue não encontrada.' });
      const newRecord = { id: randomUUID(), gangId: data.gangId, name: gang[0].canonical_name };
      const audit = auditQuery('BLACKLIST_PROMOTE', 'external_relation', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([sql.query("INSERT INTO external_relations(id,gang_id,name,normalized_name,relation_type,status) VALUES($1,$2,$3,$4,'blacklist','active')", [newRecord.id, data.gangId, gang[0].canonical_name, gang[0].normalized_name]), sql.query(audit.text, audit.params)]);
      return json(201, newRecord);
    }
    if (action === 'create') {
      const name = cleanText(data.name, 100); if (!name || !validStatus(data.status || 'active')) return json(400, { error: 'Dados inválidos.' });
      const newRecord = { id: randomUUID(), name, normalizedName: normalizeName(name), relationType: type, status: data.status || 'active', notes: cleanText(data.notes) || null };
      const audit = auditQuery(`${type.toUpperCase()}_ADD`, 'external_relation', newRecord.id, null, newRecord, ipHash);
      await sql.transaction([
        sql.query('INSERT INTO gangs(canonical_name,normalized_name) VALUES($1,$2) ON CONFLICT(normalized_name) DO NOTHING', [name,normalizeName(name)]),
        sql.query('INSERT INTO external_relations(id,name,normalized_name,relation_type,status,notes,gang_id) SELECT $1,$2,$3,$4,$5,$6,id FROM gangs WHERE normalized_name=$3', Object.values(newRecord)), sql.query(audit.text, audit.params)]);
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

export async function reserveSubmission(sql, ipHash) {
  // Serialize the check and reservation so concurrent public requests share a quota.
  const attempts = await sql.transaction([
    sql.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ipHash]),
    sql.query("INSERT INTO ocr_submission_attempts(ip_hash) SELECT $1 WHERE (SELECT count(*) FROM ocr_submission_attempts WHERE ip_hash=$1 AND created_at > now()-interval '15 minutes') < 20 RETURNING id", [ipHash])
  ]);
  return attempts[1].length > 0;
}

export const handler = async (event) => {
  if (!process.env.DATABASE_URL) return json(503, { error: 'Banco de dados não configurado.' });
  const sql = neon(process.env.DATABASE_URL);
  const route = routeOf(event);
  try {
    if (event.httpMethod === 'GET') return json(200, await readData(sql, route));
    if (!['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) return json(405, { error: 'Método não permitido.' });
    if (Buffer.byteLength(event.body || '') > 2 * 1024 * 1024) return json(413, { error: 'Envio muito grande.' });
    let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido.' }); }
    if (!payload || typeof payload !== 'object') return json(400, { error: 'Envio inválido.' });
    if (route === 'diplomacy-submit' && event.httpMethod === 'POST') {
      const ipHash = hashIp(getIp(event));
      if (!await reserveSubmission(sql, ipHash)) return json(429, { error: 'Muitas leituras. Aguarde antes de tentar novamente.' });
      return await submitDiplomacy(sql, payload, ipHash);
    }
    const auth = await authorizeMutation({ sql, credential: payload.credential, ip: getIp(event), bootstrapCredential: process.env.ADMIN_ACTION_CREDENTIAL });
    if (!auth.ok) return json(auth.status, { error: auth.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Credencial inválida.' });
    return await mutate(sql, route, payload, auth.ipHash);
  } catch (error) {
    console.error(JSON.stringify({ event: 'api_error', route, code: error.code || 'internal' }));
    if (error.code === '23505') return json(409, { error: 'Já existe um registro com esse nome.' });
    return json(500, { error: 'Não foi possível concluir a operação.' });
  }
};
