// One picture with a photo per order line, numbered 1, 2, 3… (Erwin, 1 Nov 2026: the supplier picks the product by its
// photo, so an order with several variants needs every variant's photo where she looks: the sheet's photo preview
// cell, which can show only one image). Built on the server from the line photos (JPEGs made by the browser), with
// jpeg-js (plain JavaScript, no native parts). A photo that can't be read becomes a grey tile with its number.
import jpeg from 'jpeg-js';

// 5 × 7 digits for the number badges.
const FONT = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

function decode(bytes) {
  try { return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256, maxResolutionInMP: 40 }); } catch { return null; }
}

// Fits img inside a size × size square of out (white around it), averaging the pixels when it is made smaller.
function drawFit(out, W, x0, y0, size, img) {
  const k = Math.min(size / img.width, size / img.height), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const ox = x0 + Math.floor((size - w) / 2), oy = y0 + Math.floor((size - h) / 2), step = 1 / k;
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * step), sy1 = Math.max(sy0 + 1, Math.min(img.height, Math.floor((y + 1) * step)));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * step), sx1 = Math.max(sx0 + 1, Math.min(img.width, Math.floor((x + 1) * step)));
      let r = 0, g = 0, b = 0, n = 0;
      // At most 4 × 4 samples per pixel: enough for a thumbnail, cheap for a 1600 px photo.
      const dy = Math.max(1, Math.floor((sy1 - sy0) / 4)), dx = Math.max(1, Math.floor((sx1 - sx0) / 4));
      for (let sy = sy0; sy < sy1; sy += dy) for (let sx = sx0; sx < sx1; sx += dx) { const i = (sy * img.width + sx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
      const o = ((oy + y) * W + ox + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
}
function rect(out, W, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * W + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255; }
}
function badge(out, W, x0, y0, label, scale) {
  const digits = String(label).split(''), cw = 5 * scale, gap = scale, pad = 2 * scale;
  const w = digits.length * cw + (digits.length - 1) * gap + 2 * pad, h = 7 * scale + 2 * pad;
  rect(out, W, x0, y0, w, h, [24, 24, 24]);
  digits.forEach((d, k) => FONT[d]?.forEach((row, ry) => [...row].forEach((on, rx) => {
    if (on === '1') rect(out, W, x0 + pad + k * (cw + gap) + rx * scale, y0 + pad + ry * scale, scale, scale, [255, 255, 255]);
  })));
}

// tiles: [{ n: line number, bytes: JPEG Buffer | null }] (in line order). Two columns, so it stays readable in the
// narrow photo preview cell. Returns a JPEG Buffer.
export function collageJpeg(tiles, { tile = 200 } = {}) {
  const cols = tiles.length > 1 ? 2 : 1, rows = Math.ceil(tiles.length / cols), gap = Math.max(4, Math.round(tile / 40));
  const W = cols * tile + (cols + 1) * gap, H = rows * tile + (rows + 1) * gap, out = new Uint8Array(W * H * 4);
  rect(out, W, 0, 0, W, H, [210, 210, 210]);
  const scale = Math.max(3, Math.round(tile / 40));
  tiles.forEach((t, i) => {
    const x = gap + (i % cols) * (tile + gap), y = gap + Math.floor(i / cols) * (tile + gap);
    rect(out, W, x, y, tile, tile, [255, 255, 255]);
    const img = t.bytes ? decode(t.bytes) : null;
    if (img) drawFit(out, W, x, y, tile, img); else rect(out, W, x, y, tile, tile, [190, 190, 190]);
    badge(out, W, x, y, t.n, scale);
  });
  return Buffer.from(jpeg.encode({ data: out, width: W, height: H }, 82).data);
}
