const OCR_MODULE = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/+esm';

export const normalizeGangName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();

function isGangName(text) {
  const ignored = /^(INIMIGOS|ALIADOS|CONFRONTOS|LIVRO|SOLICITACOES|NOME DA GANGUE|VOLTAR|AVANCAR|SAIR DA ALIANCA|ATACAR|PROPOR ALIANCA|DIPLOMACIA|GANGUES)$/;
  return text.length >= 3 && text.length <= 45 && /[A-Z]/.test(text) && !ignored.test(normalizeGangName(text)) && !/^\d+[\s/.-]*\d*$/.test(text);
}

export class TesseractOcrProvider {
  async load() {
    if (!this.module) this.module = await import(/* @vite-ignore */ OCR_MODULE);
    return this.module;
  }

  async preprocess(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(2, Math.max(1, 1800 / bitmap.width));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114;
      const contrast = gray < 135 ? Math.max(0, gray * .72) : Math.min(255, gray * 1.18);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = contrast;
    }
    context.putImageData(pixels, 0, 0);
    bitmap.close();
    const slices = [];
    const sliceHeight = Math.min(canvas.width * 1.25, canvas.height);
    for (let y = 0; y < canvas.height; y += sliceHeight) {
      const part = document.createElement('canvas'); part.width = canvas.width; part.height = Math.min(sliceHeight, canvas.height - y);
      part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height); slices.push(part);
    }
    return slices;
  }

  extract(result) {
    const lines = result.data.lines || [];
    return lines.map((line) => ({ name: line.text.replace(/[|_[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(), confidence: Math.round(line.confidence || 0) }))
      .filter((row) => isGangName(row.name));
  }

  async recognize(file, onProgress = () => {}) {
    const { createWorker } = await this.load();
    const worker = await createWorker('por', 1, { logger: (message) => message.status === 'recognizing text' && onProgress(Math.round(message.progress * 100)) });
    const slices = await this.preprocess(file); const results = []; const raw = [];
    try {
      for (const slice of slices) { const result = await worker.recognize(slice); raw.push(result.data.text); results.push(...this.extract(result)); }
    } finally { await worker.terminate(); }
    const unique = new Map();
    for (const item of results) { const key = normalizeGangName(item.name); if (!unique.has(key) || unique.get(key).confidence < item.confidence) unique.set(key, { ...item, originalText: item.name }); }
    return { rows: [...unique.values()], rawText: raw.join('\n') };
  }
}
