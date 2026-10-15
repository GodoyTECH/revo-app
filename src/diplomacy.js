const timestamp = (value) => new Date(value || 0).getTime();
function compareTime(a, b) {
  return timestamp(a) - timestamp(b) || Number(String(a).match(/\.(\d+)/)?.[1]?.padEnd(6, '0') || 0) - Number(String(b).match(/\.(\d+)/)?.[1]?.padEnd(6, '0') || 0);
}
export function compareSnapshots(a, b) {
  return compareTime(a.confirmed_at, b.confirmed_at) || compareTime(a.created_at, b.created_at) || a.id.localeCompare(b.id);
}
export function currentSnapshots(snapshots) {
  const latest = new Map();

  for (const snapshot of snapshots.filter((s) => s.status === 'CONFIRMED')) {
    const key = `${snapshot.source_faction_id}:${snapshot.relation_type}`;
    if (!latest.has(key) || compareSnapshots(snapshot, latest.get(key)) > 0) latest.set(key, snapshot);
  }
  return [...latest.values()];
}
export function consolidate({ factions = [], blacklist = [], snapshots = [], catalog = [] }) {
  const active = factions.filter((f) => f.status === 'active');
  const gangs = new Map(catalog.map((g) => [g.id, { ...g, enemy_of: [], ally_of: [] }]));
  for (const snapshot of currentSnapshots(snapshots)) {
    const faction = active.find((f) => f.id === snapshot.source_faction_id);
    if (!faction) continue;
    for (const entry of snapshot.entries || []) {
      const id = entry.target_gang_id;
      if (!gangs.has(id)) gangs.set(id, { id, name: entry.name, enemy_of: [], ally_of: [] });
      const list = gangs.get(id)[snapshot.relation_type === 'ALLY' ? 'ally_of' : 'enemy_of'];
      if (!list.some((s) => s.id === faction.id)) list.push({ id: faction.id, name: faction.name, snapshot_id: snapshot.id, date: snapshot.confirmed_at, relation_type: snapshot.relation_type });
    }
  }
  for (const gang of gangs.values()) {
    gang.is_enemy = gang.enemy_of.length > 0; gang.is_ally = gang.ally_of.length > 0;
    gang.blacklisted = blacklist.some((b) => b.gang_id === gang.id && b.status === 'active');
    gang.is_organization = active.some((f) => f.gang_id === gang.id);
    const expected = active.filter((f) => f.gang_id !== gang.id);
    gang.expected = expected.length;
    gang.ally_count = gang.ally_of.filter((s) => expected.some((f) => f.id === s.id)).length;
    gang.percentage = expected.length ? Math.round(gang.ally_count / expected.length * 100) : 0;
    gang.divergence = gang.is_enemy && gang.is_ally;
    gang.critical = gang.blacklisted && gang.is_ally;
    gang.missing = active.filter((f) => !gang.enemy_of.some((s) => s.id === f.id));
    gang.coverage = active.length ? Math.round((active.length - gang.missing.length) / active.length * 100) : 0;
  }
  return [...gangs.values()];
}
export function snapshotDiff(snapshot, snapshots) {
  const previous = currentSnapshots(snapshots.filter((s) => s.id !== snapshot.id && s.source_faction_id === snapshot.source_faction_id && s.relation_type === snapshot.relation_type && compareSnapshots(s, snapshot) < 0))[0];
  const before = previous?.entries || [], after = snapshot.entries || [];
  return { added: after.filter((e) => !before.some((b) => b.target_gang_id === e.target_gang_id)), removed: before.filter((e) => !after.some((b) => b.target_gang_id === e.target_gang_id)) };
}
