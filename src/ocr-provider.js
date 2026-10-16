import { listRegions } from './ocr-layout.js';
import { decodeImage } from './gallery.js';
const OCR_MODULE = '/vendor/tesseract/tesseract.esm.min.js';

import { normalizeGangName } from './names.js';
export { normalizeGangName } from './names.js';

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
    const regions = listRegions(pixels), slices = [];
    for (const region of regions) {
      let left = region.left, top = region.top, width = region.width, height = region.height;
      if (region.card) {
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        for (let y = region.top + 3; y < region.top + region.height - 3; y++) for (let x = region.left + 2; x < canvas.width - 3; x++) {
          const i = (y * canvas.width + x) * 4;
          if (pixels.data[i] < 90) { minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); }
        }
        if (maxX > minX && maxY > minY) { left = minX; top = minY; width = maxX-minX+1; height = maxY-minY+1; }
      }
      const padding = 16, part = document.createElement('canvas'); part.width = width + padding * 2; part.height = height + padding * 2;
      const target = part.getContext('2d'); target.fillStyle = '#fff'; target.fillRect(0,0,part.width,part.height);
      target.drawImage(canvas, left, top, width, height, padding, padding, width, height);
      if (region.card) {
        const textPixels = target.getImageData(0, 0, part.width, part.height);
        for (let i = 0; i < textPixels.data.length; i += 4) {
          if (i && i % 1048576 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
          const value = textPixels.data[i] < 100 ? 0 : 255;
          textPixels.data[i] = textPixels.data[i+1] = textPixels.data[i+2] = value;
        }
        target.putImageData(textPixels, 0, 0);
      }
      let image = part;
      if (region.card) {
        // Put wrapped lines of ONE card on a single baseline; never merge different cards.
        const p = target.getImageData(0,0,part.width,part.height), lines = []; let lineStart = null;
        for (let y=0;y<=part.height;y++) {
          let ink=0;
          if(y<part.height) for(let x=0;x<part.width;x++) if(p.data[(y*part.width+x)*4]<100) ink++;
          if(ink>2 && lineStart===null) lineStart=y;
          if(ink<=2 && lineStart!==null) { if(y-lineStart>=6) lines.push({top:lineStart,bottom:y});lineStart=null; }
        }
        const merged=[];
        for(const line of lines) { const previous=merged.at(-1);if(previous&&line.top-previous.bottom<=6)previous.bottom=line.bottom;else merged.push({...line}); }
        if(merged.length>1&&merged.length<=3) {
          for(const line of merged) {
            line.left=part.width;line.right=0;
            for(let y=line.top;y<line.bottom;y++)for(let x=0;x<part.width;x++)if(p.data[(y*part.width+x)*4]<100){line.left=Math.min(line.left,x);line.right=Math.max(line.right,x);}
          }
          const lineHeight=Math.max(...merged.map((l)=>l.bottom-l.top));
          image=document.createElement('canvas');image.height=lineHeight+32;image.width=32+merged.reduce((sum,l)=>sum+Math.ceil((l.right-l.left+1)*lineHeight/(l.bottom-l.top))+24,0);
          const output=image.getContext('2d');output.fillStyle='#fff';output.fillRect(0,0,image.width,image.height);let x=16;
          for(const line of merged){const width=Math.ceil((line.right-line.left+1)*lineHeight/(line.bottom-line.top));output.drawImage(part,line.left,line.top,line.right-line.left+1,line.bottom-line.top,x,16,width,lineHeight);x+=width+24;}
        }
      }
      const blob = await new Promise((resolve) => part.toBlob(resolve, 'image/png'));
      const reflowBlob = image !== part ? await new Promise((resolve) => image.toBlob(resolve, 'image/png')) : null;
      if (!blob?.size) throw new Error('Falha ao preparar imagem para OCR.');
      slices.push({ blob, reflowBlob, card: region.card }); if(image!==part){image.width=0;image.height=0;} part.width = 0; part.height = 0;
    }
    canvas.width = 0; canvas.height = 0;
    return slices;
  }

  extract(result, card = false) {
    const lines = result.data.blocks?.flatMap((block) => block.paragraphs?.flatMap((paragraph) => paragraph.lines || []) || []) || result.data.lines || [];
    if (card) {
      const text = lines.map((l) => l.text.trim()).filter(Boolean).join(' ');
      const confidence = lines.length ? lines.reduce((sum, l) => sum + (l.confidence || 0), 0) / lines.length : 0;
      return isGangName(text) ? [{ name: text.replace(/[|_[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(), originalText: text.slice(0, 160), confidence: Math.round(confidence) }] : [];
    }
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
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      onProgress(0, 'identificando regiões');
      for (let index = 0; index < slices.length; index++) {
        const slice = slices[index]; await worker.setParameters({ tessedit_pageseg_mode: '6' });
        const result = await worker.recognize(slice.blob, {}, { blocks: true });
        let rows = this.extract(result, slice.card);
        if (slice.reflowBlob && (!rows.length || rows[0].confidence < 85)) {
          onProgress(Math.round(index / slices.length * 100), 'conferindo nome com baixa confiança');
          await worker.setParameters({ tessedit_pageseg_mode: '7' });
          const alternative = this.extract(await worker.recognize(slice.reflowBlob, {}, { blocks: true }), true);
          const previous = rows[0];
          if (alternative.length && (!previous || alternative[0].confidence > previous.confidence)) rows = alternative;
          if (previous && alternative[0] && previous.name !== alternative[0].name) rows[0].uncertain = true;
        }
        onProgress(Math.round((index + 1) / slices.length * 100), 'extraindo nomes'); results.push(...rows);
      }
    } finally { await worker.terminate(); }
    return { rows: results };
  }
}
