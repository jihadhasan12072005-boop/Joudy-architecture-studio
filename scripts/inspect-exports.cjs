// Inspect downloaded export files: PNG/PDF pixel content (non-background share), GLB mesh content.
// Usage: node scripts/inspect-exports.cjs <file...>   (needs poppler's pdftoppm for PDFs)
const fs = require('fs');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

function decodePng(buf) {
  let i = 8, w = 0, h = 0, ct = 0, bd = 8; const idat = [];
  while (i < buf.length) {
    const l = buf.readUInt32BE(i), t = buf.toString('latin1', i + 4, i + 8), c = buf.subarray(i + 8, i + 8 + l); i += 12 + l;
    if (t === 'IHDR') { w = c.readUInt32BE(0); h = c.readUInt32BE(4); bd = c[8]; ct = c[9]; }
    if (t === 'IDAT') idat.push(c);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct]; const stride = w * bpp + 1;
  const out = Buffer.alloc(w * h * bpp); let prev = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride]; const line = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    for (let x = 0; x < line.length; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255; else if (f === 2) line[x] = (line[x] + b) & 255; else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    line.copy(out, y * w * bpp); prev = line;
  }
  return { w, h, bpp, px: out };
}

/** Share of pixels that differ clearly from the dominant (background) colour, plus alpha check. */
function content(img) {
  const { w, h, bpp, px } = img; const counts = new Map(); const n = w * h;
  const at = (i) => (bpp >= 3 ? [px[i * bpp], px[i * bpp + 1], px[i * bpp + 2]] : [px[i * bpp], px[i * bpp], px[i * bpp]]);
  for (let i = 0; i < n; i += 7) { const [r, g, b] = at(i); const k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3); counts.set(k, (counts.get(k) || 0) + 1); }
  const bgK = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [(bgK >> 10) << 3, ((bgK >> 5) & 31) << 3, (bgK & 31) << 3];
  let diff = 0, transparent = 0;
  for (let i = 0; i < n; i++) {
    const [r, g, b] = at(i);
    if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 40) diff++;
    if (bpp === 4 && px[i * 4 + 3] < 10) transparent++;
  }
  return { w, h, contentPct: (100 * diff) / n, transparentPct: (100 * transparent) / n, bg: `rgb(${bg})` };
}

function inspect(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return { type: 'png', ...content(decodePng(buf)) };
  if (ext === '.pdf') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfi-'));
    execFileSync('pdftoppm', ['-r', '40', '-png', '-f', '1', '-l', '1', file, path.join(dir, 'p')]);
    const png = fs.readdirSync(dir).find((f) => f.endsWith('.png'));
    return { type: 'pdf', ...content(decodePng(fs.readFileSync(path.join(dir, png)))) };
  }
  if (ext === '.glb') {
    if (buf.toString('latin1', 0, 4) !== 'glTF') return { type: 'glb', error: 'bad magic' };
    const jl = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf8', 20, 20 + jl));
    const meshes = json.meshes?.length ?? 0;
    const tris = (json.meshes || []).flatMap((m) => m.primitives).reduce((s, p) => {
      const acc = json.accessors[p.attributes.POSITION]; return s + (p.mode === undefined || p.mode === 4 ? acc.count / 3 : 0);
    }, 0);
    const mins = (json.accessors || []).filter((a) => a.min && a.max && a.type === 'VEC3');
    const ext3 = mins.length ? [0, 1, 2].map((k) => Math.max(...mins.map((a) => a.max[k])) - Math.min(...mins.map((a) => a.min[k]))) : [0, 0, 0];
    return { type: 'glb', meshes, triangles: Math.round(tris), extentM: ext3.map((v) => +v.toFixed(2)) };
  }
  if (ext === '.json') { const j = JSON.parse(buf.toString('utf8')); return { type: 'json', masses: j.model?.masses?.length, image: !!j.referenceImage }; }
  return { type: ext, size: buf.length };
}

module.exports = { inspect };
if (require.main === module) for (const f of process.argv.slice(2)) console.log(path.basename(f), JSON.stringify(inspect(f)));
