// Mask → polygons (outer rings with holes), traced along pixel edges, then
// simplified. Coordinates are in pixel units, y pointing down.

import type { Mask } from './raster';

export type Pt = [number, number];
export type Ring = Pt[];
export interface Polygon {
  outer: Ring; // clockwise on screen (positive signed area, y-down)
  holes: Ring[];
}

export function signedArea(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonArea(p: Polygon): number {
  return Math.abs(signedArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
}

export function ringPerimeter(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

export function pointInRing([x, y]: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Trace all boundaries of a mask. Diagonal-only contacts are kept separate (4-connectivity). */
export function traceMask(m: Mask, w: number, h: number): Ring[] {
  const W = w + 1;
  const sx: number[] = [], sy: number[] = [], ex: number[] = [], ey: number[] = [];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    if (!at(x, y - 1)) { sx.push(x); sy.push(y); ex.push(x + 1); ey.push(y); }
    if (!at(x + 1, y)) { sx.push(x + 1); sy.push(y); ex.push(x + 1); ey.push(y + 1); }
    if (!at(x, y + 1)) { sx.push(x + 1); sy.push(y + 1); ex.push(x); ey.push(y + 1); }
    if (!at(x - 1, y)) { sx.push(x); sy.push(y + 1); ex.push(x); ey.push(y); }
  }
  const byStart = new Map<number, number[]>();
  for (let i = 0; i < sx.length; i++) {
    const k = sy[i] * W + sx[i];
    const l = byStart.get(k);
    if (l) l.push(i); else byStart.set(k, [i]);
  }
  const used = new Uint8Array(sx.length);
  const rings: Ring[] = [];
  for (let e0 = 0; e0 < sx.length; e0++) {
    if (used[e0]) continue;
    const ring: Ring = [];
    let e = e0;
    while (!used[e]) {
      used[e] = 1;
      ring.push([sx[e], sy[e]]);
      const dx = ex[e] - sx[e], dy = ey[e] - sy[e];
      const cands = (byStart.get(ey[e] * W + ex[e]) ?? []).filter((c) => !used[c]);
      if (!cands.length) break;
      if (cands.length === 1) { e = cands[0]; continue; }
      // Prefer the right turn (towards the interior in this orientation).
      let best = cands[0], bestScore = -9;
      for (const c of cands) {
        const cdx = ex[c] - sx[c], cdy = ey[c] - sy[c];
        const cross = dx * cdy - dy * cdx; // >0 = right turn on screen (y-down)
        const score = cross > 0 ? 2 : cross === 0 ? 1 : 0;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      e = best;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function removeCollinear(r: Ring): Ring {
  const out: Ring = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out;
}

function dp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)];
}

/** Collinear removal + Douglas–Peucker (closed ring). */
export function simplifyRing(r: Ring, eps = 1.2): Ring {
  let ring = removeCollinear(r);
  if (ring.length < 4 || eps <= 0) return ring;
  // split at the two farthest-apart points for a stable closed DP
  let far = 0, fd = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const a = dp(ring.slice(0, far + 1), eps);
  const b = dp([...ring.slice(far), ring[0]], eps);
  ring = [...a.slice(0, -1), ...b.slice(0, -1)];
  return ring.length >= 3 ? ring : removeCollinear(r);
}

/** Full pipeline: mask → simplified polygons with holes, dropping specks. */
export function maskToPolygons(m: Mask, w: number, h: number, eps = 1.2, minArea = 4): Polygon[] {
  const rings = traceMask(m, w, h).map((r) => ({ r, a: signedArea(r) }));
  const outers = rings.filter((x) => x.a > 0 && x.a >= minArea).sort((p, q) => p.a - q.a);
  const holes = rings.filter((x) => x.a < 0 && -x.a >= minArea);
  const polys: { p: Polygon; a: number; raw: Ring }[] = outers.map((o) => ({ p: { outer: simplifyRing(o.r, eps), holes: [] }, a: o.a, raw: o.r }));
  for (const hr of holes) {
    const probe: Pt = [hr.r[0][0] + 0.5, hr.r[0][1] + 0.5];
    // a hole's first vertex lies on its boundary; test a slightly offset point against raw outer rings (smallest first)
    const owner = polys.find((o) => pointInRing(probe, o.raw) || pointInRing(hr.r[0], o.raw));
    if (owner) owner.p.holes.push(simplifyRing(hr.r, eps));
  }
  return polys.map((x) => x.p).filter((p) => p.outer.length >= 3);
}

/** A point guaranteed (approximately) inside a polygon for labels. */
export function labelPoint(p: Polygon): Pt {
  const xs = p.outer.map((v) => v[0]), ys = p.outer.map((v) => v[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const inside = (pt: Pt) => pointInRing(pt, p.outer) && !p.holes.some((h) => pointInRing(pt, h));
  let best: Pt = [(minX + maxX) / 2, (minY + maxY) / 2];
  if (inside(best)) return best;
  let bestD = -1;
  const n = 12;
  for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
    const pt: Pt = [minX + ((maxX - minX) * i) / n, minY + ((maxY - minY) * j) / n];
    if (!inside(pt)) continue;
    let d = Infinity;
    for (const r of [p.outer, ...p.holes]) for (let k = 0; k < r.length; k++) {
      const a = r[k], b = r[(k + 1) % r.length];
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
      d = Math.min(d, Math.hypot(pt[0] - a[0] - t * vx, pt[1] - a[1] - t * vy));
    }
    if (d > bestD) { bestD = d; best = pt; }
  }
  return best;
}
