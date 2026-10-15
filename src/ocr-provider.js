import { decodeImage } from './gallery.js';
const OCR_MODULE = '/vendor/tesseract/tesseract.esm.min.js';

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
    const bitmap = await decodeImage(file);
    const scale = Math.min(2, 1800 / bitmap.width, Math.sqrt(8000000 / (bitmap.width * bitmap.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (i && i % 1048576 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const gray = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114;
      const contrast = gray < 135 ? Math.max(0, gray * .72) : Math.min(255, gray * 1.18);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = contrast;
    }
    context.putImageData(pixels, 0, 0);
    bitmap.close?.();
    const slices = [];
    const sliceHeight = Math.max(1, Math.floor(Math.min(canvas.width * 1.25, canvas.height)));
    for (let y = 0; y < canvas.height; y += sliceHeight) {
      const part = document.createElement('canvas'); part.width = canvas.width; part.height = Math.min(sliceHeight, canvas.height - y);
      part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      const blob = await new Promise((resolve) => part.toBlob(resolve, 'image/png'));
      if (!blob?.size) throw new Error('Falha ao preparar imagem para OCR.');
      slices.push(blob); part.width = 0; part.height = 0;
    }
    return slices;
  }

  extract(result) {
    const lines = result.data.blocks?.flatMap((block) => block.paragraphs?.flatMap((paragraph) => paragraph.lines || []) || []) || result.data.lines || [];
    return lines.map((line) => ({ name: line.text.replace(/[|_[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(), originalText: line.text.trim().slice(0, 160), confidence: Math.round(line.confidence || 0) }))
      .filter((row) => isGangName(row.name));
  }

  async recognize(file, onProgress = () => {}) {
    onProgress(0, 'carregando OCR');
    const loaded = await this.load();
    const createWorker = loaded.createWorker || loaded.default?.createWorker;
    const worker = await createWorker('por', 1, { workerPath: '/vendor/tesseract/worker.min.js', corePath: '/vendor/tesseract-core', langPath: '/vendor/tessdata', workerBlobURL: false, logger: (message) => message.status === 'recognizing text' && onProgress(Math.round(message.progress * 100), 'executando OCR') });
    const results = [];
    try {
      onProgress(0, 'preparando imagem');
      const slices = await this.preprocess(file);
      onProgress(0, 'identificando regiões');
      for (let index = 0; index < slices.length; index++) { const slice = slices[index]; const result = await worker.recognize(slice, {}, { blocks: true }); onProgress(Math.round((index + 1) / slices.length * 100), 'extraindo nomes'); results.push(...this.extract(result)); }
    } finally { await worker.terminate(); }
    const unique = new Map();
    for (const item of results) { const key = normalizeGangName(item.name); if (!unique.has(key) || unique.get(key).confidence < item.confidence) unique.set(key, { ...item }); }
    return { rows: [...unique.values()] };
  }
}
