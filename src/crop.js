import { decodeImage } from './gallery.js';
export function initCropEditor(onApply) {
  const dialog = document.querySelector('#cropDialog'), canvas = dialog.querySelector('canvas'), selection = dialog.querySelector('.crop-selection');
  const inputs = [...dialog.querySelectorAll('input[type=range]')];
  let file, bitmap;
  const bounds = () => Object.fromEntries(inputs.map((input) => [input.name, Number(input.value)]));
  function paint(changed) {
    const b = bounds();
    if (b.right < b.left + 5) { if (changed === 'left') b.left = b.right - 5; else b.right = b.left + 5; }
    if (b.bottom < b.top + 5) { if (changed === 'top') b.top = b.bottom - 5; else b.bottom = b.top + 5; }
    for (const input of inputs) { input.value = b[input.name]; input.nextElementSibling.textContent = `${input.value}%`; }
    selection.style.inset = `${b.top}% ${100 - b.right}% ${100 - b.bottom}% ${b.left}%`;
  }
  inputs.forEach((input) => input.addEventListener('input', () => paint(input.name)));
  dialog.querySelector('[data-crop-cancel]').onclick = () => dialog.close();
  dialog.querySelector('[data-crop-reset]').onclick = () => { for (const input of inputs) input.value = ['right','bottom'].includes(input.name) ? 100 : 0; paint(); };
  dialog.addEventListener('close', () => { bitmap?.close?.(); bitmap = null; file = null; });
  dialog.querySelector('[data-crop-apply]').onclick = async () => {
    const button = dialog.querySelector('[data-crop-apply]'); button.disabled = true;
    try {
      const b = bounds(), output = document.createElement('canvas');
      output.width = Math.max(1, Math.round(bitmap.width * (b.right - b.left) / 100));
      output.height = Math.max(1, Math.round(bitmap.height * (b.bottom - b.top) / 100));
      output.getContext('2d').drawImage(bitmap, bitmap.width * b.left / 100, bitmap.height * b.top / 100, bitmap.width * (b.right-b.left) / 100, bitmap.height * (b.bottom-b.top) / 100, 0, 0, output.width, output.height);
      const blob = await new Promise((resolve) => output.toBlob(resolve,'image/png'));
      output.width = 0; output.height = 0;
      if (!blob) throw new Error('Falha ao recortar imagem.');
      onApply(file, { blob, bounds: b }); dialog.close();
    } catch { dialog.querySelector('[role=alert]').textContent = 'Não foi possível recortar. Ajuste a seleção e tente novamente.'; }
    finally { button.disabled = false; }
  };
  return async (source, crop) => {
    file = source; bitmap = await decodeImage(source);
    const scale = Math.min(500 / bitmap.width, 360 / bitmap.height, 1);
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const input of inputs) input.value = crop?.bounds?.[input.name] ?? (['right','bottom'].includes(input.name) ? 100 : 0);
    dialog.querySelector('[role=alert]').textContent = ''; paint(); dialog.showModal();
  };
}
