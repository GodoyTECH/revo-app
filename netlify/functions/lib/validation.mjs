export const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
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
