export const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
export const cleanText = (value, max = 500) => String(value || '').trim().slice(0, max);
export const normalizeWhatsapp = (value) => {
  const source = String(value || '').trim();
  if (/[^+\d\s().-]/.test(source)) return null;
  const digits = source.replace(/\D/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
};
export const validStatus = (value) => ['active', 'inactive'].includes(value);
export const validRole = (value) => ['00', '01', '02'].includes(value);
export const validUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

export function cleanFaction(data = {}) {
  const name = cleanText(data.name, 100);
  const logoUrl = cleanText(data.logoUrl, 500);
  if (!name || !validStatus(data.status || 'active')) return null;
  if (logoUrl && !/^https:\/\//i.test(logoUrl) && !/^data:image\/(png|jpeg|webp);base64,/i.test(logoUrl)) return null;
  return { name, normalizedName: normalizeName(name), logoUrl: logoUrl || null, status: data.status || 'active', notes: cleanText(data.notes) || null };
}

export function cleanMember(data = {}) {
  const name = cleanText(data.name, 100);
  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (!name || !whatsapp || !validRole(data.role) || !validStatus(data.status || 'active')) return null;
  return { name, role: data.role, whatsapp, status: data.status || 'active', notes: cleanText(data.notes) || null };
}

export function cleanDiplomacySubmission(data = {}) {
  if (!validUuid(data.sourceFactionId) || !['ALLY', 'ENEMY'].includes(data.relationType) || data.importMode !== 'COMPLETE') return null;
  if (!Array.isArray(data.entries) || data.entries.length < 1 || data.entries.length > 250) return null;
  if (!Array.isArray(data.images) || data.images.length < 1 || data.images.length > 5) return null;
  const entries = data.entries.map((entry) => ({ name: cleanText(entry.name, 100), originalText: cleanText(entry.originalText || entry.name, 160), confidence: Number(entry.confidence) })).filter((entry) => entry.name && Number.isFinite(entry.confidence) && entry.confidence >= 0 && entry.confidence <= 100);
  const images = data.images.map((image) => ({ fileName: cleanText(image.fileName, 150), mimeType: image.mimeType, sha256: String(image.sha256 || '').toLowerCase(), rawText: cleanText(image.rawText, 20000) })).filter((image) => ['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) && /^[a-f0-9]{64}$/.test(image.sha256));
  if (entries.length !== data.entries.length || images.length !== data.images.length) return null;
  return { sourceFactionId: data.sourceFactionId, relationType: data.relationType, importMode: 'COMPLETE', entries, images };
}
