export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
export function validateFiles(files, existing = []) {
  const accepted = [...existing], errors = [];
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) { errors.push(`${file.name}: formato inválido. Use PNG, JPEG ou WEBP.`); continue; }
    if (file.size > MAX_IMAGE_SIZE) { errors.push(`${file.name}: arquivo muito grande. Máximo 12 MB.`); continue; }
    if (!file.size) { errors.push(`${file.name}: arquivo corrompido ou vazio.`); continue; }
    if (accepted.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) continue;
    if (accepted.length >= 5) { errors.push('Quantidade acima do limite de cinco imagens.'); continue; }
    accepted.push(file);
  }
  return { accepted, errors };
}
// Safari versions without createImageBitmap can decode through an HTML image.
export async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* Try the native image decoder too. */ }
  }
  const url = URL.createObjectURL(file), image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Arquivo corrompido ou formato não suportado.')); image.src = url; });
    image.close = () => URL.revokeObjectURL(url);
    return image;
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
