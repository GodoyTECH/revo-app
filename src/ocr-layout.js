// Detect horizontal card separators. Wrapped name lines inside a card stay together.
export function listRegions({ data, width, height }) {
  const bands = []; let start = null;
  for (let y = 0; y <= height; y++) {
    let dark = 0, total = 0;
    if (y < height) for (let x = Math.floor(width * .03); x < width * .97; x += 3) {
      const i = (y * width + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 100) dark++;
      total++;
    }
    const separator = y < height && dark / total > .92;
    if (separator && start === null) start = y;
    if (!separator && start !== null) { if (y - start >= 2) bands.push({ start, end: y }); start = null; }
  }
  const regions = []; let top = 0;
  for (const band of [...bands, { start: height, end: height }]) {
    if (band.start - top >= Math.max(24, height * .04)) regions.push({ top, height: band.start - top });
    top = band.end;
  }
  // A plain column of text without cards uses one OCR block, never arbitrary height cuts.
  if (regions.length < 2) return [{ top: 0, height, left: 0, width, card: false }];
  return regions.map((r) => {
    const ratio = width / r.height;
    const left = ratio >= 2.6 && ratio < 4.5 ? Math.floor(width * .32) : 0;
    return { ...r, left, width: width - left, card: true };
  });
}
