// Geometry core of the massing editor. Pure functions (no DOM), unit-tested.
// Units: metres. Plan axes: x → east, z → south (screen down in plan view), y ↑.
// A mass is a prism defined by a local outline (+ optional holes) that is
// rotated by `rot` (degrees, clockwise seen from above) and moved to (x, z).

import polygonClipping, { type MultiPolygon, type Polygon as PCPolygon } from 'polygon-clipping';
import { ShapeUtils, Vector2 } from 'three';

export type V2 = [number, number];

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip' | 'barrel' | 'dome' | 'wave';

export interface RoofSpec {
  type: RoofType;
  rise: number; // m above the eave (wall top)
  dir: number; // degrees: slope / ridge orientation, clockwise from north
  waves: number; // for 'wave'
}

export interface Mass {
  id: string;
  name: string;
  outline: V2[]; // local, closed implicitly
  bulge: number[]; // per edge i→i+1, sagitta in m (+ = outward curve)
  radius: number[]; // per vertex corner rounding radius in m
  holes: V2[][]; // local
  x: number;
  z: number;
  rot: number; // degrees
  base: number; // bottom elevation (m)
  height: number; // wall height (eave) above base
  floorHeight: number;
  color: string;
  roof: RoofSpec;
}

export const ROOF_LABELS: Record<RoofType, string> = {
  flat: 'مسطح',
  shed: 'مائل باتجاه واحد',
  gable: 'جملوني (سطحان)',
  hip: 'هرمي / أربعة أسطح',
  barrel: 'منحنٍ أسطواني (قبو)',
  dome: 'قبة منحنية',
  wave: 'انسيابي متموّج',
};

// ---------------------------------------------------------------------------
// Basic polygon helpers
// ---------------------------------------------------------------------------
export function signedArea(r: V2[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % r.length];
    s += x1 * z2 - x2 * z1;
  }
  return s / 2;
}
export const ringArea = (r: V2[]) => Math.abs(signedArea(r));

export function bbox(points: V2[]): { minX: number; minZ: number; maxX: number; maxZ: number; w: number; d: number } {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ, w: maxX - minX, d: maxZ - minZ };
}

export function centroid(r: V2[]): V2 {
  const a = signedArea(r);
  if (Math.abs(a) < 1e-9) {
    const b = bbox(r);
    return [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
  }
  let cx = 0, cz = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % r.length];
    const f = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

export function pointInRing([x, z]: V2, r: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Local → world. Rotation is clockwise seen from above (x east, z south). */
export function toWorld(m: Pick<Mass, 'x' | 'z' | 'rot'>, [lx, lz]: V2): V2 {
  const c = Math.cos(rad(m.rot)), s = Math.sin(rad(m.rot));
  return [m.x + lx * c - lz * s, m.z + lx * s + lz * c];
}
export function toLocal(m: Pick<Mass, 'x' | 'z' | 'rot'>, [wx, wz]: V2): V2 {
  const c = Math.cos(rad(m.rot)), s = Math.sin(rad(m.rot));
  const dx = wx - m.x, dz = wz - m.z;
  return [dx * c + dz * s, -dx * s + dz * c];
}

// ---------------------------------------------------------------------------
// Curves: edge bulges and corner rounding
// ---------------------------------------------------------------------------
function quadBezier(a: V2, c: V2, b: V2, n: number): V2[] {
  const out: V2[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** True circular fillet between A (on V→P) and B (on V→N), tangent cut distance d. */
function filletArc(P: V2, V: V2, N: V2, A: V2, B: V2, d: number): V2[] {
  const u1x = P[0] - V[0], u1z = P[1] - V[1], u2x = N[0] - V[0], u2z = N[1] - V[1];
  const l1 = Math.hypot(u1x, u1z) || 1, l2 = Math.hypot(u2x, u2z) || 1;
  const bx = u1x / l1 + u2x / l2, bz = u1z / l1 + u2z / l2;
  const bl = Math.hypot(bx, bz) || 1;
  const cosT = (u1x * u2x + u1z * u2z) / (l1 * l2);
  const half = Math.acos(Math.max(-1, Math.min(1, cosT))) / 2;
  const r = d * Math.tan(half);
  const dist = r / Math.sin(half);
  const C: V2 = [V[0] + (bx / bl) * dist, V[1] + (bz / bl) * dist];
  let a0 = Math.atan2(A[1] - C[1], A[0] - C[0]);
  let a1 = Math.atan2(B[1] - C[1], B[0] - C[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const n = Math.max(6, Math.ceil(Math.abs(da) / (Math.PI / 24)));
  const out: V2[] = [];
  for (let k = 0; k < n; k++) {
    const t = a0 + (da * k) / n;
    out.push([C[0] + r * Math.cos(t), C[1] + r * Math.sin(t)]);
  }
  void a1;
  return out;
}

/**
 * Resolve an outline with per-edge bulges and per-vertex corner radii into a
 * dense polyline ring (local coordinates).
 */
export function resolveRing(pts: V2[], bulge: number[] = [], radius: number[] = []): V2[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const ccw = signedArea(pts) > 0;
  const out: V2[] = [];
  const len = (a: V2, b: V2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  // tangent cut distances per vertex
  const cut = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const r = radius[i] ?? 0;
    if (r <= 0) continue;
    const prevEdge = (i - 1 + n) % n;
    if ((bulge[prevEdge] ?? 0) !== 0 || (bulge[i] ?? 0) !== 0) continue; // only between straight edges
    const P = pts[(i - 1 + n) % n], V = pts[i], N = pts[(i + 1) % n];
    const a1 = Math.atan2(P[1] - V[1], P[0] - V[0]), a2 = Math.atan2(N[1] - V[1], N[0] - V[0]);
    let th = Math.abs(a1 - a2);
    if (th > Math.PI) th = 2 * Math.PI - th;
    if (th < 0.05 || th > Math.PI - 0.05) continue;
    cut[i] = Math.min(r / Math.tan(th / 2), len(P, V) * 0.48, len(V, N) * 0.48);
  }
  const along = (from: V2, to: V2, d: number): V2 => {
    const L = len(from, to) || 1;
    return [from[0] + ((to[0] - from[0]) * d) / L, from[1] + ((to[1] - from[1]) * d) / L];
  };
  for (let i = 0; i < n; i++) {
    const P = pts[(i - 1 + n) % n], V = pts[i], N = pts[(i + 1) % n];
    // corner at V
    if (cut[i] > 0) {
      const A = along(V, P, cut[i]), B = along(V, N, cut[i]);
      out.push(...filletArc(P, V, N, A, B, cut[i]), B);
    } else out.push(V);
    // edge V → N
    const s = bulge[i] ?? 0;
    if (s !== 0) {
      const start = cut[i] > 0 ? along(V, N, cut[i]) : V;
      const end = cut[(i + 1) % n] > 0 ? along(N, V, cut[(i + 1) % n]) : N;
      const dx = end[0] - start[0], dz = end[1] - start[1];
      const L = Math.hypot(dx, dz) || 1;
      // outward normal: right of the edge for a CCW ring (x,z math frame)
      const nx = ccw ? dz / L : -dz / L, nz = ccw ? -dx / L : dx / L;
      const ctrl: V2 = [(start[0] + end[0]) / 2 + 2 * s * nx, (start[1] + end[1]) / 2 + 2 * s * nz];
      const seg = Math.max(8, Math.min(48, Math.ceil(L / 0.4)));
      out.push(...quadBezier(start, ctrl, end, seg).slice(1));
    }
  }
  return dedupe(out);
}

function dedupe(r: V2[]): V2[] {
  const out: V2[] = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  }
  return out;
}

/** Split long edges so curved roofs can follow the wall tops smoothly. */
export function resample(r: V2[], maxSeg: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(L / maxSeg));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}

/** Final local rings: [outer, ...holes]. */
export function massRings(m: Mass): V2[][] {
  return [resolveRing(m.outline, m.bulge, m.radius), ...m.holes.filter((h) => h.length >= 3)];
}

export function massWorldRings(m: Mass): V2[][] {
  return massRings(m).map((r) => r.map((p) => toWorld(m, p)));
}

export function massArea(m: Mass): number {
  const [o, ...h] = massRings(m);
  return ringArea(o) - h.reduce((s, r) => s + ringArea(r), 0);
}

// ---------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------
export interface RoofFrame { uMin: number; uMax: number; vMin: number; vMax: number; ux: number; uz: number }

export function roofFrame(ring: V2[], dir: number): RoofFrame {
  // direction: clockwise from north (−z). Unit vector in (x, z):
  const ux = Math.sin(rad(dir)), uz = -Math.cos(rad(dir));
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, z] of ring) {
    const u = x * ux + z * uz, v = -x * uz + z * ux;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  return { uMin, uMax, vMin, vMax, ux, uz };
}

/** Height of the roof surface above the eave at local point (x, z). */
export function roofOffset(spec: RoofSpec, f: RoofFrame, [x, z]: V2): number {
  if (spec.type === 'flat' || spec.rise <= 0) return 0;
  const u = x * f.ux + z * f.uz, v = -x * f.uz + z * f.ux;
  const t = Math.min(1, Math.max(0, (u - f.uMin) / Math.max(1e-6, f.uMax - f.uMin)));
  const w = Math.min(1, Math.max(0, (v - f.vMin) / Math.max(1e-6, f.vMax - f.vMin)));
  const r = spec.rise;
  switch (spec.type) {
    case 'shed': return r * t;
    case 'gable': return r * (1 - Math.abs(2 * t - 1));
    case 'hip': return r * Math.min(1 - Math.abs(2 * t - 1), 1 - Math.abs(2 * w - 1));
    case 'barrel': return r * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    case 'dome': return r * Math.sqrt(Math.max(0, 1 - ((2 * t - 1) ** 2 + (2 * w - 1) ** 2)));
    case 'wave': return r * 0.5 * (1 - Math.cos(2 * Math.PI * Math.max(1, spec.waves) * t));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Mesh generation (plain arrays → BufferGeometry in the viewer)
// ---------------------------------------------------------------------------
export interface MassMeshData {
  positions: number[]; // non-indexed triangles, world coordinates
  lines: number[]; // line segments (pairs of points) for crisp edges
  floorLines: number[];
  top: number; // highest point (world y)
}

function subdivide(tri: [V2, V2, V2], levels: number, out: [V2, V2, V2][]) {
  if (levels <= 0) { out.push(tri); return; }
  const [a, b, c] = tri;
  const ab: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const bc: V2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
  const ca: V2 = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
  subdivide([a, ab, ca], levels - 1, out);
  subdivide([ab, b, bc], levels - 1, out);
  subdivide([ca, bc, c], levels - 1, out);
  subdivide([ab, bc, ca], levels - 1, out);
}

export function buildMassMesh(m: Mass, opts: { floorLines?: boolean } = {}): MassMeshData {
  const curvedRoof = m.roof.type !== 'flat' && m.roof.rise > 0;
  const raw = massRings(m);
  const rings = raw.map((r) => (curvedRoof ? resample(r, 0.6) : r));
  const frame = roofFrame(rings[0], m.roof.dir);
  const eave = m.base + m.height;
  const hAt = (p: V2) => eave + roofOffset(m.roof, frame, p);
  const W = (p: V2, y: number): [number, number, number] => {
    const [wx, wz] = toWorld(m, p);
    return [wx, y, wz];
  };
  const positions: number[] = [];
  const lines: number[] = [];
  const floorLines: number[] = [];
  const push = (...v: [number, number, number][]) => { for (const p of v) positions.push(...p); };

  // Top & bottom faces
  const contour = rings[0].map(([x, z]) => new Vector2(x, z));
  const holes = rings.slice(1).map((h) => h.map(([x, z]) => new Vector2(x, z)));
  const all = [...rings[0], ...rings.slice(1).flat()];
  const faces = ShapeUtils.triangulateShape(contour, holes);
  let top = eave;
  for (const [i, j, k] of faces) {
    const tri: [V2, V2, V2] = [all[i], all[j], all[k]];
    push(W(tri[0], m.base), W(tri[2], m.base), W(tri[1], m.base));
    const parts: [V2, V2, V2][] = [];
    subdivide(tri, curvedRoof ? 3 : 0, parts);
    for (const [a, b, c] of parts) {
      const ha = hAt(a), hb = hAt(b), hc = hAt(c);
      top = Math.max(top, ha, hb, hc);
      push(W(a, ha), W(b, hb), W(c, hc));
    }
  }
  // Walls + edges
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ha = hAt(a), hb = hAt(b);
      push(W(a, m.base), W(b, m.base), W(b, hb));
      push(W(a, m.base), W(b, hb), W(a, ha));
      lines.push(...W(a, m.base), ...W(b, m.base), ...W(a, ha), ...W(b, hb));
      if (opts.floorLines && m.floorHeight > 0) {
        for (let y = m.base + m.floorHeight; y < Math.min(ha, hb) - 0.05; y += m.floorHeight) floorLines.push(...W(a, y), ...W(b, y));
      }
    }
    // vertical edges only at real corners of the resolved (unresampled) ring
    const corners = raw[r];
    for (let i = 0; i < corners.length; i++) {
      const P = corners[(i - 1 + corners.length) % corners.length], V = corners[i], N = corners[(i + 1) % corners.length];
      const a1 = Math.atan2(V[1] - P[1], V[0] - P[0]), a2 = Math.atan2(N[1] - V[1], N[0] - V[0]);
      let d = Math.abs(a1 - a2);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > 0.35) lines.push(...W(V, m.base), ...W(V, hAt(V)));
    }
  }
  // ridge hint lines for pitched roofs: drawn by the top surface edges only (kept light)
  return { positions, lines, floorLines, top };
}

// ---------------------------------------------------------------------------
// Editing operations
// ---------------------------------------------------------------------------
export function newId(): string {
  return 'm' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export const DEFAULT_ROOF: RoofSpec = { type: 'flat', rise: 2, dir: 0, waves: 2 };
export const MASS_COLORS = ['#e9dfcf', '#d9c3a5', '#c9b6a0', '#b9c4b5', '#c3c4d6', '#e0cfb0', '#d6c6c0'];

/** Create a mass from a world-space polygon (re-centred so position = centroid). */
export function massFromWorld(world: V2[], props: Partial<Mass> = {}, holesWorld: V2[][] = []): Mass {
  const ring = signedArea(world) < 0 ? [...world].reverse() : world;
  const [cx, cz] = centroid(ring);
  const local = ring.map(([x, z]) => [x - cx, z - cz] as V2);
  return {
    id: newId(),
    name: 'كتلة',
    outline: local,
    bulge: local.map(() => 0),
    radius: local.map(() => 0),
    holes: holesWorld.map((h) => h.map(([x, z]) => [x - cx, z - cz] as V2)),
    x: cx,
    z: cz,
    rot: 0,
    base: 0,
    height: 6.4,
    floorHeight: 3.2,
    color: MASS_COLORS[0],
    roof: { ...DEFAULT_ROOF },
    ...props,
    ...(props.x === undefined ? { x: cx } : {}),
    ...(props.z === undefined ? { z: cz } : {}),
  } as Mass;
}

/** Scale a mass in its local frame about a local anchor point (anchor stays put in the world). */
export function scaleMass(m: Mass, sx: number, sz: number, anchor: V2 = [0, 0]): Mass {
  sx = Math.max(0.02, sx);
  sz = Math.max(0.02, sz);
  const f = ([x, z]: V2): V2 => [anchor[0] + (x - anchor[0]) * sx, anchor[1] + (z - anchor[1]) * sz];
  const avg = Math.sqrt(sx * sz);
  return { ...m, outline: m.outline.map(f), holes: m.holes.map((h) => h.map(f)), bulge: m.bulge.map((b) => b * avg) };
}

/** Set exact local bounding-box size (length × width), keeping the box centre fixed. */
export function setMassSize(m: Mass, length: number, width: number): Mass {
  const b = bbox(m.outline);
  const c: V2 = [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
  return scaleMass(m, length / Math.max(1e-6, b.w), width / Math.max(1e-6, b.d), c);
}

export function duplicateMass(m: Mass, offset = 3): Mass {
  return { ...structuredClone(m), id: newId(), name: `${m.name} (نسخة)`, x: m.x + offset, z: m.z + offset };
}

export function insertVertex(m: Mass, edge: number): Mass {
  const n = m.outline.length;
  const a = m.outline[edge], b = m.outline[(edge + 1) % n];
  const mid: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const outline = [...m.outline.slice(0, edge + 1), mid, ...m.outline.slice(edge + 1)];
  const bulge = [...m.bulge.slice(0, edge), 0, 0, ...m.bulge.slice(edge + 1)];
  const radius = [...m.radius.slice(0, edge + 1), 0, ...m.radius.slice(edge + 1)];
  return { ...m, outline, bulge, radius };
}

export function removeVertex(m: Mass, i: number): Mass {
  if (m.outline.length <= 3) return m;
  const n = m.outline.length;
  const prev = (i - 1 + n) % n;
  const bulge = m.bulge.slice();
  bulge[prev] = 0;
  bulge.splice(i, 1);
  return { ...m, outline: m.outline.filter((_, k) => k !== i), bulge, radius: m.radius.filter((_, k) => k !== i) };
}

// ---------------------------------------------------------------------------
// Boolean operations (union / subtract) via polygon-clipping
// ---------------------------------------------------------------------------
const toPC = (rings: V2[][]): PCPolygon => rings.map((r) => [...r.map((p) => [p[0], p[1]] as [number, number]), [r[0][0], r[0][1]] as [number, number]]);
const fromPC = (ring: [number, number][]): V2[] => dedupe(ring.map(([x, z]) => [x, z] as V2));

/** Union of several masses. Returns one world polygon set per connected result. */
export function unionMasses(ms: Mass[]): MultiPolygon {
  const polys = ms.map((m) => toPC(massWorldRings(m)));
  return polygonClipping.union(polys[0], ...polys.slice(1));
}

/** Merge masses into one when they touch/overlap. Returns null if the result is disconnected. */
export function mergeMasses(ms: Mass[]): Mass | null {
  if (ms.length < 2) return null;
  const u = unionMasses(ms);
  if (u.length !== 1) return null;
  const [outer, ...holes] = u[0].map(fromPC);
  const tallest = [...ms].sort((a, b) => b.height - a.height)[0];
  return massFromWorld(outer, {
    name: ms.map((m) => m.name).join(' + ').slice(0, 40),
    height: tallest.height,
    base: Math.min(...ms.map((m) => m.base)),
    floorHeight: tallest.floorHeight,
    color: tallest.color,
    roof: { ...tallest.roof },
  }, holes);
}

/** Subtract a world-space void polygon from a mass. Returns the resulting masses (0, 1 or more). */
export function subtractFromMass(m: Mass, voidWorld: V2[]): Mass[] {
  const res = polygonClipping.difference(toPC(massWorldRings(m)), toPC([voidWorld]));
  return res.map((poly, k) => {
    const [outer, ...holes] = poly.map(fromPC);
    // keep the original rotation: express new rings in the mass' local frame
    const local = outer.map((p) => toLocal(m, p));
    const nm: Mass = {
      ...m,
      id: k === 0 ? m.id : newId(),
      name: k === 0 ? m.name : `${m.name} ${k + 1}`,
      outline: signedArea(local) < 0 ? local.reverse() : local,
      holes: holes.map((h) => h.map((p) => toLocal(m, p))),
    };
    nm.bulge = nm.outline.map(() => 0);
    nm.radius = nm.outline.map(() => 0);
    return nm;
  });
}

export function intersects(m: Mass, poly: V2[]): boolean {
  return polygonClipping.intersection(toPC(massWorldRings(m)), toPC([poly])).length > 0;
}

/** Bake rotation into the outline (useful before snapping/aligning). */
export function rectangle(x0: number, z0: number, x1: number, z1: number): V2[] {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [c, d] = [Math.min(z0, z1), Math.max(z0, z1)];
  return [[a, c], [b, c], [b, d], [a, d]];
}
