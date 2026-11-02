// One picture with a photo per order line (Erwin, 1 Nov 2026: the supplier picks the product by its photo, so an order
// with several variants needs every variant's photo where she looks: the sheet's photo preview cell, which can show
// only one image). Each photo carries a small label with its variant name ("Ocean Blue"; Erwin, 2 Nov 2026), or its
// line number when the variant has no name we can draw. Built on the server from the line photos (JPEGs made by the
// browser), with jpeg-js (plain JavaScript, no native parts). A photo that can't be read becomes a grey tile.
import jpeg from 'jpeg-js';

// 5 × 7 letters, digits and common signs for the labels (drawn proportionally: each glyph keeps only its used columns).
const FONT = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11100 10010 10001 10001 10001 10010 11100', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  a: '00000 00000 01110 00001 01111 10001 01111', b: '10000 10000 10110 11001 10001 10001 11110', c: '00000 00000 01110 10000 10000 10001 01110',
  d: '00001 00001 01101 10011 10001 10001 01111', e: '00000 00000 01110 10001 11111 10000 01110', f: '00110 01001 01000 11100 01000 01000 01000',
  g: '00000 01111 10001 10001 01111 00001 01110', h: '10000 10000 10110 11001 10001 10001 10001', i: '00100 00000 01100 00100 00100 00100 01110',
  j: '00010 00000 00110 00010 00010 10010 01100', k: '10000 10000 10010 10100 11000 10100 10010', l: '01100 00100 00100 00100 00100 00100 01110',
  m: '00000 00000 11010 10101 10101 10001 10001', n: '00000 00000 10110 11001 10001 10001 10001', o: '00000 00000 01110 10001 10001 10001 01110',
  p: '00000 00000 11110 10001 11110 10000 10000', q: '00000 00000 01101 10011 01111 00001 00001', r: '00000 00000 10110 11001 10000 10000 10000',
  s: '00000 00000 01110 10000 01110 00001 11110', t: '01000 01000 11100 01000 01000 01001 00110', u: '00000 00000 10001 10001 10001 10011 01101',
  v: '00000 00000 10001 10001 10001 01010 00100', w: '00000 00000 10001 10001 10101 10101 01010', x: '00000 00000 10001 01010 00100 01010 10001',
  y: '00000 00000 10001 10001 01111 00001 01110', z: '00000 00000 11111 00010 00100 01000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11110 00001 00001 01110 00001 00001 11110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000', '-': '00000 00000 00000 11111 00000 00000 00000',
  "'": '00100 00100 01000 00000 00000 00000 00000', '"': '01010 01010 00000 00000 00000 00000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000', '/': '00000 00001 00010 00100 01000 10000 00000', '&': '01100 10010 10100 01000 10101 10010 01101',
  '+': '00000 00100 00100 11111 00100 00100 00000', ':': '00000 01100 01100 00000 01100 01100 00000', '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100', '#': '01010 01010 11111 01010 11111 01010 01010', '%': '11000 11001 00010 00100 01000 10011 00011',
};
// Each glyph: its rows, trimmed to the columns it uses (a space is 3 columns wide).
const GLYPHS = Object.fromEntries(Object.entries(FONT).map(([ch, s]) => {
  const rows = s.split(' '), used = [0, 1, 2, 3, 4].filter(x => rows.some(r => r[x] === '1'));
  const a = Math.min(...used), b = Math.max(...used);
  return [ch, rows.map(r => r.slice(a, b + 1))];
}));
GLYPHS[' '] = Array(7).fill('000');

// What can be drawn of a variant name: accents dropped, × and fancy quotes made plain, other letters left out.
export function labelText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/×/g, 'x').replace(/[″“”]/g, '"').replace(/[′‘’]/g, "'")
    .replace(/[–—]/g, '-').replace(/\s+/g, ' ').split('').filter(ch => GLYPHS[ch]).join('').trim();
}

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
const textWidth = (chars, s) => chars.reduce((w, ch) => w + GLYPHS[ch][0].length * s + s, 0) - (chars.length ? s : 0);
// A small dark label in the tile's top-left corner; a name too long for the tile is cut and ends with "..".
function label(out, W, x0, y0, text, s, maxW) {
  const pad = 2 * s;
  let chars = [...text];
  if (textWidth(chars, s) > maxW - 2 * pad) { while (chars.length && textWidth([...chars, '.', '.'], s) > maxW - 2 * pad) chars.pop(); chars = [...chars.join('').trimEnd(), '.', '.']; }
  rect(out, W, x0, y0, textWidth(chars, s) + 2 * pad, 7 * s + 2 * pad, [24, 24, 24]);
  let x = x0 + pad;
  for (const ch of chars) {
    GLYPHS[ch].forEach((row, ry) => [...row].forEach((on, rx) => { if (on === '1') rect(out, W, x + rx * s, y0 + pad + ry * s, s, s, [255, 255, 255]); }));
    x += GLYPHS[ch][0].length * s + s;
  }
}

// tiles: [{ n: line number, name: variant name, bytes: JPEG Buffer | null }] (in line order). Two columns, so it stays
// readable in the narrow photo preview cell. Returns a JPEG Buffer.
export function collageJpeg(tiles, { tile = 200 } = {}) {
  const cols = tiles.length > 1 ? 2 : 1, rows = Math.ceil(tiles.length / cols), gap = Math.max(4, Math.round(tile / 40));
  const W = cols * tile + (cols + 1) * gap, H = rows * tile + (rows + 1) * gap, out = new Uint8Array(W * H * 4);
  rect(out, W, 0, 0, W, H, [210, 210, 210]);
  const s = Math.max(2, Math.floor(tile / 100));
  tiles.forEach((t, i) => {
    const x = gap + (i % cols) * (tile + gap), y = gap + Math.floor(i / cols) * (tile + gap);
    rect(out, W, x, y, tile, tile, [255, 255, 255]);
    const img = t.bytes ? decode(t.bytes) : null;
    if (img) drawFit(out, W, x, y, tile, img); else rect(out, W, x, y, tile, tile, [190, 190, 190]);
    label(out, W, x, y, labelText(t.name) || '#' + t.n, s, tile);
  });
  return Buffer.from(jpeg.encode({ data: out, width: W, height: H }, 82).data);
}
