import { normalizeGangName } from './names.js';
export function resolveGang(name, catalog) {
  const key = normalizeGangName(name);
  return catalog.find((g) => normalizeGangName(g.name || g.canonical_name) === key || g.normalized_name === key)
    || catalog.find((g) => (g.aliases || []).some((a) => normalizeGangName(a) === key));
}
export function reviewNotices(rows, { catalog = [], blacklist = [], relationType, current = [] }) {
  const groups = new Map(), notices = [];
  rows.forEach((row, index) => {
    const match = resolveGang(row.name, catalog), key = match?.id || normalizeGangName(row.name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
    if (!row.fromSnapshot && current.some((e) => e.target_gang_id === match?.id)) notices.push({ code: 'EXISTING', name: row.name, indexes: [index], message: `Bloco ${index + 1}: ${row.name} já está na lista atual desta FAC; será mantida sem duplicar.` });
    if (relationType === 'ENEMY' && blacklist.some((b) => b.status === 'active' && b.gang_id === match?.id)) notices.push({ code: 'BLACKLIST', name: row.name, indexes: [index], message: `Bloco ${index + 1}: ${row.name} já está na Blacklist oficial. Não precisa cadastrar novamente; o nome será reutilizado para registrar a guerra desta FAC e calcular a cobertura.` });
  });
  for (const indexes of groups.values()) if (indexes.length > 1) {
    const name = resolveGang(rows[indexes[0]].name, catalog)?.name || rows[indexes[0]].name;
    notices.unshift({ code: 'DUPLICATE', name, indexes, message: `${name}: repetição nos blocos ${indexes.map((i) => i + 1).join(', ')}. Será salva uma única relação, preservando as origens.` });
  }
  return notices;
}
