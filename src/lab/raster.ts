// Raster image-processing primitives for reading architectural plans.
// Pure functions on typed arrays (no DOM) so they run in the browser and in tests.
// Masks are Uint8Array with 1 = set, 0 = empty, row-major, size w*h.

export type Mask = Uint8Array;

/** Luminance 0..255 from RGBA (alpha composited over white). */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    const l = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    g[i] = Math.round(l * a + 255 * (1 - a));
  }
  return g;
}

/** Otsu's threshold. */
export function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

export function threshold(gray: Uint8Array, t: number, invert = false): Mask {
  const m = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) m[i] = (invert ? gray[i] > t : gray[i] <= t) ? 1 : 0;
  return m;
}

/** Square-kernel dilation (r = radius) in O(n), separable sliding window. */
export function dilate(m: Mask, w: number, h: number, r: number): Mask {
  if (r <= 0) return m.slice();
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    let count = 0;
    const row = y * w;
    for (let x = 0; x < Math.min(r, w); x++) count += m[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) count += m[row + x + r];
      if (x - r - 1 >= 0) count -= m[row + x - r - 1];
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, h); y++) count += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) count += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) count -= tmp[(y - r - 1) * w + x];
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

export function invertMask(m: Mask): Mask {
  const o = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1;
  return o;
}

export function erode(m: Mask, w: number, h: number, r: number): Mask {
  return invertMask(dilate(invertMask(m), w, h, r));
}
/** Opening removes features thinner than 2r+1 px (text, furniture, dimension lines). */
export function open(m: Mask, w: number, h: number, r: number): Mask {
  return dilate(erode(m, w, h, r), w, h, r);
}
/** Closing bridges gaps up to ~2r px (door openings). */
export function close(m: Mask, w: number, h: number, r: number): Mask {
  return erode(dilate(m, w, h, r), w, h, r);
}

/** Pixels of `passable` reachable from the image border (4-connectivity). */
export function floodFromBorder(passable: Mask, w: number, h: number): Mask {
  const out = new Uint8Array(passable.length);
  const stack = new Int32Array(passable.length);
  let sp = 0;
  const push = (i: number) => {
    if (passable[i] && !out[i]) { out[i] = 1; stack[sp++] = i; }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < (h - 1) * w) push(i + w);
  }
  return out;
}

export interface Component {
  label: number; // 1-based
  area: number;
  seed: number; // first pixel index in scan order
  minX: number; minY: number; maxX: number; maxY: number;
}

/** 4-connected components of `m`. labels[i] = 0 or component label (1-based, scan order). */
export function components(m: Mask, w: number, h: number): { labels: Int32Array; comps: Component[] } {
  const labels = new Int32Array(m.length);
  const comps: Component[] = [];
  const stack = new Int32Array(m.length);
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || labels[s]) continue;
    const label = comps.length + 1;
    const c: Component = { label, area: 0, seed: s, minX: w, minY: h, maxX: 0, maxY: 0 };
    let sp = 0;
    stack[sp++] = s;
    labels[s] = label;
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      c.area++;
      if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && m[j] && !labels[j]) { labels[j] = label; stack[sp++] = j; }
    }
    comps.push(c);
  }
  return { labels, comps };
}

/**
 * Multi-source BFS: grow `labels` (>0 = source) into pixels where `passable` is
 * set. Returns the grown label map and, for every pair of different labels whose
 * fronts meet, how they met (`door` when the meeting pixel is in `freeMask`).
 */
export function growLabels(labels: Int32Array, passable: Mask, w: number, h: number, freeMask?: Mask) {
  const out = labels.slice();
  const queue = new Int32Array(labels.length);
  let qh = 0, qt = 0;
  for (let i = 0; i < out.length; i++) if (out[i] > 0) queue[qt++] = i;
  const meets = new Map<string, { door: boolean; count: number }>();
  const meet = (a: number, b: number, door: boolean) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    const e = meets.get(k);
    if (e) { e.count++; e.door = e.door || door; } else meets.set(k, { door, count: 1 });
  };
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w, y = (i - x) / w;
    const li = out[i];
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0) continue;
      const lj = out[j];
      if (lj === 0 && passable[j]) { out[j] = li; queue[qt++] = j; }
      else if (lj > 0 && lj !== li) meet(li, lj, !!(freeMask && (freeMask[i] || freeMask[j]) && !labels[i] && !labels[j]));
    }
  }
  return { labels: out, meets };
}

/**
 * Chamfer (3-4 → 10/14) distance transform from `sources` through `passable`
 * pixels, Dijkstra with a bucket queue. Returns distance in pixel units
 * (Infinity where unreachable).
 */
export function geodesicDistance(sources: number[], passable: Mask, w: number, h: number): Float32Array {
  const INF = 0x7fffffff;
  const d = new Int32Array(passable.length).fill(INF);
  const buckets: number[][] = [];
  const push = (i: number, v: number) => {
    if (v >= d[i]) return;
    d[i] = v;
    (buckets[v] ??= []).push(i);
  };
  for (const s of sources) if (passable[s]) push(s, 0);
  for (let v = 0; v < buckets.length; v++) {
    const b = buckets[v];
    if (!b) continue;
    for (const i of b) {
      if (d[i] !== v) continue;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!passable[j]) continue;
        // block diagonal squeezing between two wall pixels
        if (dx && dy && !passable[y * w + nx] && !passable[ny * w + x]) continue;
        push(j, v + (dx && dy ? 14 : 10));
      }
    }
    buckets[v] = undefined as unknown as number[];
  }
  const out = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i] === INF ? Infinity : d[i] / 10;
  return out;
}

/** Unconstrained chamfer distance from set pixels of `src` (two-pass). */
export function distanceTransform(src: Mask, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(src.length);
  for (let i = 0; i < d.length; i++) d[i] = src[i] ? 0 : INF;
  const D = 1, DD = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + D);
    if (y > 0) {
      v = Math.min(v, d[i - w] + D);
      if (x > 0) v = Math.min(v, d[i - w - 1] + DD);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + DD);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + D);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + D);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + DD);
      if (x > 0) v = Math.min(v, d[i + w - 1] + DD);
    }
    d[i] = v;
  }
  return d;
}
