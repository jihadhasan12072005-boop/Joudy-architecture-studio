// Plan-reading pipeline and massing model.
//
// Pipeline (all deterministic, runs locally):
//   image → grayscale → ink (Otsu threshold) → walls (opening removes thin lines:
//   text, furniture, dimensions, hatching) → closed walls (closing bridges door
//   openings) → outside = flood fill from the border → footprint = not outside →
//   spaces = enclosed components inside the footprint.
// Spaces can then be marked as courtyards/voids and given floor counts; the
// height field is turned back into polygons for 2D diagrams and 3D extrusion.

import {
  close, components, dilate, distanceTransform, floodFromBorder, geodesicDistance, growLabels, open, otsu, threshold, toGray, type Mask,
} from './raster';
import { maskToPolygons, type Polygon, type Pt } from './trace';

export interface ExtractParams {
  threshold: number | null; // null = automatic (Otsu)
  invert: boolean; // light lines on dark background
  thinLine: number | null; // opening radius (px) — removes lines thinner than 2r+1; null = auto
  doorGap: number | null; // closing radius for rooms (bridges doors ≈ 2r px); null = auto from wall thickness
  outlineGap: number | null; // closing radius for the outer outline (bridges windows/entrances); null = auto
  minSpacePct: number; // spaces smaller than this % of the footprint are treated as solid
}

export const DEFAULT_PARAMS: ExtractParams = { threshold: null, invert: false, thinLine: null, doorGap: null, outlineGap: null, minSpacePct: 0.12 };

export interface UsedParams { threshold: number; thinLine: number; doorGap: number; outlineGap: number }

function thickness(m: Mask, w: number, h: number): number {
  const dt = distanceTransform(invertMask01(m), w, h);
  const samples: number[] = [];
  for (let i = 0; i < m.length; i += 2) if (m[i]) samples.push(dt[i]);
  if (!samples.length) return 2;
  samples.sort((a, b) => a - b);
  return Math.max(1, 2 * samples[Math.floor(samples.length * 0.75)]);
}

export interface SpaceInfo {
  label: number;
  area: number; // px²
  seed: Pt;
  bbox: [number, number, number, number];
  suggestedVoid: boolean;
}

export interface Extraction {
  w: number;
  h: number;
  thresholdUsed: number;
  used: UsedParams;
  ink: Mask;
  walls: Mask; // thick lines only (doors still open)
  closed: Mask; // walls with doors bridged
  outside: Mask;
  footprint: Mask; // building incl. walls, spaces and enclosed courtyards
  labels: Int32Array; // space label per pixel (0 = wall/outside)
  spaces: SpaceInfo[];
  doors: [number, number][]; // spaces connected through an opening
  touching: [number, number][]; // spaces sharing a wall
  wallPx: number; // estimated wall thickness in px
  footprintPx: number;
}

export function extract(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, p: ExtractParams = DEFAULT_PARAMS): Extraction {
  const gray = toGray(rgba, w, h);
  const t = p.threshold ?? otsu(gray);
  const ink = threshold(gray, t, p.invert);
  let inkCount = 0;
  for (const v of ink) inkCount += v;
  // Auto thin-line removal: keep r=1 unless that would erase most of the drawing (single-line walls).
  let thinLine = p.thinLine ?? 1;
  let walls = thinLine > 0 ? open(ink, w, h, thinLine) : ink;
  if (p.thinLine === null) {
    let wc = 0;
    for (const v of walls) wc += v;
    if (wc < inkCount * 0.2) { thinLine = 0; walls = ink; }
  }
  const wallT = thickness(walls, w, h);
  // Doors ≈ 0.9–1 m ≈ 4–5 wall thicknesses (bridged by r = 2.2t); windows/entrances up to ≈ 2–2.5 m (r = 4.5t).
  const doorGap = p.doorGap ?? Math.max(2, Math.round(wallT * 2.2));
  const outlineGap = p.outlineGap ?? Math.max(doorGap, Math.round(wallT * 4.5));
  const closedOutline = outlineGap > 0 ? close(walls, w, h, outlineGap) : walls;
  // Windows are usually drawn as thin lines spanning a wall opening. Thin ink
  // that lies inside such bridged openings is kept as a separator, so rooms and
  // courtyards don't merge through windows (door openings without lines stay open).
  const sep = walls.slice();
  // Thin lines are often anti-aliased to mid-grey, so use a lighter threshold here.
  const light = Math.round((t + 255) / 2);
  if (thinLine > 0) for (let i = 0; i < sep.length; i++) if ((p.invert ? gray[i] > 255 - light : gray[i] <= light) && closedOutline[i] && !walls[i]) sep[i] = 1;
  const closed = doorGap > 0 ? close(sep, w, h, doorGap) : sep;
  const notWall = new Uint8Array(w * h);
  for (let i = 0; i < notWall.length; i++) notWall[i] = closedOutline[i] ? 0 : 1;
  const outside = floodFromBorder(notWall, w, h);
  // Footprint = solid regions not reachable from the border. Isolated symbols
  // outside the building (north arrow, bold titles, legend boxes) also form
  // small solid islands, so keep only components ≥ 5% of the largest one.
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < solid.length; i++) solid[i] = outside[i] ? 0 : 1;
  const fc = components(solid, w, h);
  const biggest = Math.max(0, ...fc.comps.map((c) => c.area));
  const keepFp = new Uint8Array(fc.comps.length + 1);
  for (const c of fc.comps) keepFp[c.label] = c.area >= biggest * 0.05 ? 1 : 0;
  const footprint = new Uint8Array(w * h);
  let footprintPx = 0;
  for (let i = 0; i < footprint.length; i++) {
    if (fc.labels[i] && keepFp[fc.labels[i]]) { footprint[i] = 1; footprintPx++; }
    else if (!outside[i]) outside[i] = 1;
  }

  // Wall thickness ≈ 2 × 75th percentile of distance-to-non-wall measured on wall pixels.
  const dtWall = distanceTransform(invertMask01(closed), w, h);
  const samples: number[] = [];
  for (let i = 0; i < closed.length; i += 3) if (closed[i] && footprint[i]) samples.push(dtWall[i]);
  samples.sort((a, b) => a - b);
  const wallPx = samples.length ? Math.max(1, 2 * samples[Math.floor(samples.length * 0.75)]) : 2;

  const interior = new Uint8Array(w * h);
  for (let i = 0; i < interior.length; i++) interior[i] = footprint[i] && !closed[i] ? 1 : 0;
  const { labels: raw, comps } = components(interior, w, h);
  const minArea = Math.max(12, (footprintPx * p.minSpacePct) / 100);
  const keep = new Int32Array(comps.length + 1);
  const spaces: SpaceInfo[] = [];
  for (const c of comps) {
    if (c.area < minArea) continue;
    const label = spaces.length + 1;
    keep[c.label] = label;
    const sx = c.seed % w;
    spaces.push({ label, area: c.area, seed: [sx, (c.seed - sx) / w], bbox: [c.minX, c.minY, c.maxX, c.maxY], suggestedVoid: false });
  }
  const labels = new Int32Array(w * h);
  for (let i = 0; i < raw.length; i++) if (raw[i]) labels[i] = keep[raw[i]];

  // Better seed: the pixel deepest inside each space (for labels and stable re-identification).
  const dtSpace = distanceTransform(invertLabels(labels), w, h);
  const best = new Float32Array(spaces.length + 1).fill(-1);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l && dtSpace[i] > best[l]) { best[l] = dtSpace[i]; const x = i % w; spaces[l - 1].seed = [x, (i - x) / w]; }
  }
  // Courtyard suggestion (to be confirmed by the user): a large space that has
  // no exterior wall, i.e. it is surrounded by the building on every side.
  const dtOut = distanceTransform(outside, w, h);
  const minOut = new Float32Array(spaces.length + 1).fill(Infinity);
  for (let i = 0; i < labels.length; i++) if (labels[i] && dtOut[i] < minOut[labels[i]]) minOut[labels[i]] = dtOut[i];
  for (const s of spaces) s.suggestedVoid = spaces.length > 2 && s.area > footprintPx * 0.06 && minOut[s.label] > wallPx * 2.5 + 2;

  // Connectivity: grow spaces through free floor (doors open) and through walls.
  const free = new Uint8Array(w * h);
  for (let i = 0; i < free.length; i++) free[i] = footprint[i] && !walls[i] ? 1 : 0;
  const viaFree = growLabels(labels, free, w, h, free);
  const doors: [number, number][] = [];
  for (const [k, v] of viaFree.meets) if (v.count >= 2) doors.push(k.split('|').map(Number) as [number, number]);
  const wallPass = new Uint8Array(w * h);
  for (let i = 0; i < wallPass.length; i++) wallPass[i] = footprint[i] && !labels[i] ? 1 : 0;
  const viaWall = growLabels(labels, wallPass, w, h);
  const touching: [number, number][] = [];
  for (const [k, v] of viaWall.meets) if (v.count >= 3) touching.push(k.split('|').map(Number) as [number, number]);


  return { w, h, thresholdUsed: t, used: { threshold: t, thinLine, doorGap, outlineGap }, ink, walls, closed, outside, footprint, labels, spaces, doors, touching, wallPx, footprintPx };
}

function invertLabels(l: Int32Array): Mask {
  const m = new Uint8Array(l.length);
  for (let i = 0; i < l.length; i++) m[i] = l[i] ? 0 : 1;
  return m;
}
function invertMask01(m: Mask): Mask {
  const o = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1;
  return o;
}

// ---------------------------------------------------------------------------
// Study settings
// ---------------------------------------------------------------------------
export type SpaceRole = 'space' | 'void' | 'circulation';
export type ZoneKey = 'public' | 'semi' | 'private' | 'service' | 'circulation' | '';

export interface SpaceSetting {
  seed: Pt; // a pixel inside the space — used to re-identify it after re-extraction
  role: SpaceRole;
  floors: number | null; // null = study default
  zone: ZoneKey;
  name: string;
}

export type MassingMode = 'block' | 'volumetric' | 'exploded';

export interface ScaleInfo {
  mPerPx: number;
  method: 'reference' | 'width' | 'estimate';
  ref?: { a: Pt; b: Pt; meters: number };
}

/** Space settings resolved to labels. */
export interface Resolved {
  role: SpaceRole[]; // index = label (0 unused)
  floors: number[];
  zone: ZoneKey[];
  name: string[];
}

export function labelAt(ext: Extraction, [x, y]: Pt, radius = 4): number {
  const xi = Math.round(x), yi = Math.round(y);
  for (let r = 0; r <= radius; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = xi + dx, Y = yi + dy;
      if (X < 0 || Y < 0 || X >= ext.w || Y >= ext.h) continue;
      const l = ext.labels[Y * ext.w + X];
      if (l) return l;
    }
  return 0;
}

export function resolve(ext: Extraction, settings: SpaceSetting[], defaultFloors: number): Resolved {
  const n = ext.spaces.length + 1;
  const r: Resolved = { role: Array(n).fill('space'), floors: Array(n).fill(defaultFloors), zone: Array(n).fill(''), name: Array(n).fill('') };
  for (const s of ext.spaces) {
    r.name[s.label] = `فراغ ${s.label}`;
    if (s.suggestedVoid) r.role[s.label] = 'void';
  }
  for (const st of settings) {
    const l = labelAt(ext, st.seed);
    if (!l) continue;
    r.role[l] = st.role;
    r.floors[l] = st.floors ?? defaultFloors;
    r.zone[l] = st.zone;
    if (st.name) r.name[l] = st.name;
  }
  return r;
}

/**
 * Floors per pixel. Spaces take their own count, voids 0; wall pixels take the
 * floor count of the nearest non-void space (so walls around a courtyard
 * belong to the building, not the void).
 */
export function heightField(ext: Extraction, res: Resolved, uniform?: number): Uint8Array {
  const { w, h, labels, footprint } = ext;
  const src = new Int32Array(w * h);
  const pass = new Uint8Array(w * h);
  for (let i = 0; i < src.length; i++) {
    const l = labels[i];
    if (l) { if (res.role[l] !== 'void') src[i] = l; }
    else if (footprint[i]) pass[i] = 1;
  }
  const grown = growLabels(src, pass, w, h).labels;
  const f = new Uint8Array(w * h);
  for (let i = 0; i < f.length; i++) {
    const l = grown[i];
    if (l) f[i] = Math.max(0, Math.min(250, uniform ?? res.floors[l]));
  }
  return f;
}

export interface Volume {
  polys: Polygon[]; // px
  z0: number; // m
  z1: number; // m
  floors: number;
  level: number; // for exploded mode: floor index
}

export function buildVolumes(ext: Extraction, field: Uint8Array, mode: MassingMode, floorHeight: number, explodeGap = 2): Volume[] {
  const { w, h } = ext;
  const eps = Math.max(1, ext.wallPx * 0.35);
  const minA = Math.max(6, ext.wallPx * ext.wallPx);
  const maskWhere = (pred: (v: number) => boolean) => {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = pred(field[i]) ? 1 : 0;
    return m;
  };
  const levels = [...new Set(field)].filter((v) => v > 0).sort((a, b) => a - b);
  if (mode === 'exploded') {
    const max = levels[levels.length - 1] ?? 0;
    const out: Volume[] = [];
    for (let k = 0; k < max; k++) {
      const polys = maskToPolygons(maskWhere((v) => v > k), w, h, eps, minA);
      const z0 = k * (floorHeight + explodeGap);
      out.push({ polys, z0, z1: z0 + floorHeight * 0.85, floors: 1, level: k });
    }
    return out;
  }
  if (mode === 'block') {
    const f = levels[levels.length - 1] ?? 0;
    return [{ polys: maskToPolygons(maskWhere((v) => v > 0), w, h, eps, minA), z0: 0, z1: f * floorHeight, floors: f, level: 0 }];
  }
  return levels.map((f) => ({ polys: maskToPolygons(maskWhere((v) => v === f), w, h, eps, minA), z0: 0, z1: f * floorHeight, floors: f, level: 0 }));
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------
export function scaleFromReference(a: Pt, b: Pt, meters: number): ScaleInfo {
  const px = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { mPerPx: px > 0 && meters > 0 ? meters / px : 0.05, method: 'reference', ref: { a, b, meters } };
}

/** Footprint bounding-box width in px (for the "overall width" scale method). */
export function footprintBBox(ext: Extraction): [number, number, number, number] {
  let minX = ext.w, minY = ext.h, maxX = 0, maxY = 0;
  for (let i = 0; i < ext.footprint.length; i++) if (ext.footprint[i]) {
    const x = i % ext.w, y = (i - x) / ext.w;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX + 1, maxY + 1];
}

/** Default "estimated" scale: assume the footprint's long side is 40 m. */
export function estimatedScale(ext: Extraction): ScaleInfo {
  const [x0, y0, x1, y1] = footprintBBox(ext);
  const long = Math.max(x1 - x0, y1 - y0) || ext.w;
  return { mPerPx: 40 / long, method: 'estimate' };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
export interface SpaceMetrics {
  label: number;
  name: string;
  role: SpaceRole;
  zone: ZoneKey;
  floors: number;
  areaM2: number;
  hasFacade: boolean; // touches outside or a courtyard (daylight & air possible)
  maxDepthM: number; // farthest point from the nearest facade
  doors: number;
  travelM: number | null; // farthest walking distance from an entrance inside this space
  reachable: boolean | null;
}

export interface PlanMetrics {
  footprintM2: number; // built footprint (excl. courtyards)
  courtyardM2: number;
  siteCoverM2: number; // footprint + enclosed courtyards
  gfaM2: number;
  perimeterM: number;
  compactness: number; // 4πA/P² (1 = circle)
  spaces: SpaceMetrics[];
  circulationPct: number | null;
  maxTravelM: number | null;
  wallThicknessM: number;
  issues: { level: 'warn' | 'info'; text: string }[];
}

export function travelField(ext: Extraction, entrances: Pt[]): Float32Array | null {
  if (!entrances.length) return null;
  const { w, h, footprint, walls } = ext;
  const free = new Uint8Array(w * h);
  for (let i = 0; i < free.length; i++) free[i] = footprint[i] && !walls[i] ? 1 : 0;
  const sources: number[] = [];
  for (const [ex, ey] of entrances) {
    let bestI = -1, bestD = Infinity;
    const R = 24;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.round(ex) + dx, y = Math.round(ey) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (free[i] && dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; bestI = i; }
    }
    if (bestI >= 0) sources.push(bestI);
  }
  if (!sources.length) return null;
  return geodesicDistance(sources, free, w, h);
}

export function analyze(ext: Extraction, res: Resolved, field: Uint8Array, mPerPx: number, entrances: Pt[], travelLimitM = 30, floorHeight = 3.2): PlanMetrics {
  const { w, h, labels, footprint } = ext;
  void floorHeight;
  // Facade sources: outside + void spaces.
  const open01 = new Uint8Array(w * h);
  for (let i = 0; i < open01.length; i++) open01[i] = !footprint[i] || (labels[i] && res.role[labels[i]] === 'void') ? 1 : 0;
  const dt = distanceTransform(open01, w, h);
  const travel = travelField(ext, entrances);
  const n = ext.spaces.length + 1;
  const minD = new Float32Array(n).fill(Infinity), maxD = new Float32Array(n), area = new Float64Array(n);
  const maxT = new Float32Array(n), anyReach = new Uint8Array(n);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (!l) continue;
    area[l]++;
    if (dt[i] < minD[l]) minD[l] = dt[i];
    if (dt[i] > maxD[l]) maxD[l] = dt[i];
    if (travel && Number.isFinite(travel[i])) { anyReach[l] = 1; if (travel[i] > maxT[l]) maxT[l] = travel[i]; }
  }
  const doorCount = new Array(n).fill(0);
  for (const [a, b] of ext.doors) { doorCount[a]++; doorCount[b]++; }
  const facadeTol = ext.wallPx * 1.6 + 3;
  const px2 = mPerPx * mPerPx;
  let fp = 0, court = 0, gfa = 0;
  for (let i = 0; i < field.length; i++) {
    if (field[i]) { fp++; gfa += field[i]; }
    else if (footprint[i] && labels[i] && res.role[labels[i]] === 'void') court++;
  }
  const spaces: SpaceMetrics[] = ext.spaces.map((s) => {
    const l = s.label;
    return {
      label: l,
      name: res.name[l],
      role: res.role[l],
      zone: res.zone[l],
      floors: res.role[l] === 'void' ? 0 : res.floors[l],
      areaM2: area[l] * px2,
      hasFacade: minD[l] <= facadeTol,
      maxDepthM: maxD[l] * mPerPx,
      doors: doorCount[l],
      travelM: travel ? (anyReach[l] ? maxT[l] * mPerPx : null) : null,
      reachable: travel ? !!anyReach[l] : null,
    };
  });
  // Perimeter of the built footprint (incl. courtyard edges).
  const fpMask = new Uint8Array(w * h);
  for (let i = 0; i < field.length; i++) fpMask[i] = field[i] ? 1 : 0;
  const polys = maskToPolygons(fpMask, w, h, 1, 6);
  let perPx = 0;
  for (const p of polys) for (const r of [p.outer, ...p.holes]) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    perPx += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const footprintM2 = fp * px2, perimeterM = perPx * mPerPx;
  const usable = spaces.filter((s) => s.role !== 'void');
  const circ = usable.filter((s) => s.role === 'circulation' || s.zone === 'circulation');
  const usableArea = usable.reduce((a, s) => a + s.areaM2, 0);
  const issues: PlanMetrics['issues'] = [];
  for (const s of usable) {
    if (!s.hasFacade) issues.push({ level: 'warn', text: `«${s.name}» لا يلامس واجهة خارجية أو فناء — يحتاج إضاءة وتهوية من مصدر آخر (منور، سقف زجاجي، أو إعادة ترتيب).` });
    else if (s.maxDepthM > 7.5) issues.push({ level: 'info', text: `«${s.name}» عميق (${s.maxDepthM.toFixed(1)} م عن أقرب واجهة) — الإضاءة الطبيعية تضعف عادة بعد 6–7.5 م؛ فكري بفتحات علوية أو تقليل العمق.` });
    if (s.areaM2 < 3 && s.role !== 'circulation') issues.push({ level: 'info', text: `«${s.name}» صغير جداً (${s.areaM2.toFixed(1)} م²) — تأكدي أنه فراغ حقيقي وليس جزءاً من رسم الأثاث.` });
    if (s.doors === 0 && ext.spaces.length > 1) issues.push({ level: 'warn', text: `«${s.name}» لم يُكتشف له باب متصل بفراغ آخر — قد يكون الباب مرسوماً كخط مغلق، أو أن الفراغ معزول فعلاً.` });
    if (s.travelM !== null && s.travelM > travelLimitM) issues.push({ level: 'warn', text: `أبعد نقطة في «${s.name}» تبعد ${s.travelM.toFixed(0)} م مشياً عن أقرب مدخل — أكثر من الحد المرجعي ${travelLimitM} م. راجعي مخارج الهروب.` });
    if (s.reachable === false) issues.push({ level: 'warn', text: `«${s.name}» غير متصل بالمداخل المحددة عبر فتحات مقروءة في المسقط.` });
  }
  const compactness = perimeterM > 0 ? (4 * Math.PI * footprintM2) / (perimeterM * perimeterM) : 0;
  return {
    footprintM2,
    courtyardM2: court * px2,
    siteCoverM2: (fp + court) * px2,
    gfaM2: gfa * px2,
    perimeterM,
    compactness,
    spaces,
    circulationPct: circ.length && usableArea ? (circ.reduce((a, s) => a + s.areaM2, 0) / usableArea) * 100 : null,
    maxTravelM: travel ? Math.max(0, ...spaces.map((s) => s.travelM ?? 0)) : null,
    wallThicknessM: ext.wallPx * mPerPx,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Massing alternatives — derived from the detected spaces
// ---------------------------------------------------------------------------
export interface Variant {
  key: string;
  title: string;
  description: string;
  floors: number[]; // per label
}

export function variants(ext: Extraction, res: Resolved, base: number): Variant[] {
  const n = ext.spaces.length + 1;
  const spaces = ext.spaces.filter((s) => res.role[s.label] !== 'void');
  const cx = (s: SpaceInfo) => s.seed[0], cy = (s: SpaceInfo) => s.seed[1];
  const mk = (fn: (s: SpaceInfo) => number) => {
    const f = res.floors.slice();
    for (const s of spaces) f[s.label] = Math.max(1, Math.round(fn(s)));
    return f;
  };
  const xs = spaces.map(cx), ys = spaces.map(cy);
  const minY = Math.min(...ys), maxY = Math.max(...ys), minX = Math.min(...xs), maxX = Math.max(...xs);
  const top = Math.max(base + 2, 3);
  const largest = [...spaces].sort((a, b) => b.area - a.area)[0];
  // distance of each space to the nearest void (courtyard)
  const voidMask = new Uint8Array(ext.w * ext.h);
  let hasVoid = false;
  for (let i = 0; i < voidMask.length; i++) if (ext.labels[i] && res.role[ext.labels[i]] === 'void') { voidMask[i] = 1; hasVoid = true; }
  const dt = hasVoid ? distanceTransform(voidMask, ext.w, ext.h) : null;
  const dv = (s: SpaceInfo) => (dt ? dt[s.seed[1] * ext.w + s.seed[0]] : 0);
  const maxDv = Math.max(1, ...spaces.map(dv));
  const out: Variant[] = [
    { key: 'uniform', title: 'كتلة موحدة', description: `كل الفراغات بارتفاع ${base} طوابق — قراءة واضحة للمسقط كحجم واحد.`, floors: mk(() => base) },
    { key: 'stepNS', title: 'تدرج من الأعلى للأسفل', description: 'الارتفاع يزداد نحو أعلى المخطط وينخفض نحو أسفله (مثلاً نحو الشمس الجنوبية أو إطلالة).', floors: mk((s) => 1 + ((top - 1) * (maxY - cy(s))) / Math.max(1, maxY - minY)) },
    { key: 'stepWE', title: 'تدرج أفقي', description: 'الارتفاع يزداد من يمين المخطط إلى يساره — كتلة تتدرج نحو الشارع أو المدينة.', floors: mk((s) => 1 + ((top - 1) * (maxX - cx(s))) / Math.max(1, maxX - minX)) },
    { key: 'tower', title: 'منصة وبرج', description: `أكبر فراغ يرتفع ${top + 2} طوابق فوق منصة من طابق أو طابقين.`, floors: mk((s) => (s === largest ? top + 2 : Math.min(2, base))) },
  ];
  if (hasVoid) out.push({ key: 'court', title: 'انفتاح حول الفناء', description: 'الكتل المحيطة بالفناء منخفضة لإدخال الشمس، والأطراف أعلى لحماية الفناء.', floors: mk((s) => 1 + ((top - 1) * dv(s)) / maxDv) });
  void n;
  return out;
}

// ---------------------------------------------------------------------------
// Elevations & sections (profiles from the height field)
// ---------------------------------------------------------------------------
export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Silhouette seen from a side of the plan, left-to-right as the viewer sees it. */
export function elevationProfile(ext: Extraction, field: Uint8Array, side: Side): number[] {
  const { w, h } = ext;
  const out: number[] = [];
  if (side === 'bottom' || side === 'top') {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let y = 0; y < h; y++) m = Math.max(m, field[y * w + x]);
      out.push(m);
    }
    return side === 'bottom' ? out : out.reverse();
  }
  for (let y = 0; y < h; y++) {
    let m = 0;
    for (let x = 0; x < w; x++) m = Math.max(m, field[y * w + x]);
    out.push(m);
  }
  return side === 'left' ? out : out.reverse();
}

/** Section along a horizontal (`axis = 'h'`, at y = pos·h) or vertical line. Cut = floors at the line; beyond = max behind it (looking toward the top / left). */
export function sectionProfile(ext: Extraction, field: Uint8Array, axis: 'h' | 'v', pos: number): { cut: number[]; beyond: number[]; inside: boolean[] } {
  const { w, h } = ext;
  const cut: number[] = [], beyond: number[] = [], inside: boolean[] = [];
  if (axis === 'h') {
    const yc = Math.max(0, Math.min(h - 1, Math.round(pos * (h - 1))));
    for (let x = 0; x < w; x++) {
      cut.push(field[yc * w + x]);
      inside.push(!!ext.footprint[yc * w + x]);
      let m = 0;
      for (let y = 0; y < yc; y++) m = Math.max(m, field[y * w + x]);
      beyond.push(m);
    }
  } else {
    const xc = Math.max(0, Math.min(w - 1, Math.round(pos * (w - 1))));
    for (let y = 0; y < h; y++) {
      cut.push(field[y * w + xc]);
      inside.push(!!ext.footprint[y * w + xc]);
      let m = 0;
      for (let x = 0; x < xc; x++) m = Math.max(m, field[y * w + x]);
      beyond.push(m);
    }
  }
  return { cut, beyond, inside };
}

/** True compass direction faced by a plan side, given the clockwise angle from drawing-up to north. */
export function sideOrientation(side: Side, northAngle: number): 'N' | 'E' | 'S' | 'W' {
  const sideAz: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: 270 };
  const az = (((sideAz[side] - northAngle) % 360) + 360) % 360;
  return (['N', 'E', 'S', 'W'] as const)[Math.round(az / 90) % 4];
}

/** Mask outline helper for overlays. */
export function footprintOutline(ext: Extraction): Polygon[] {
  return maskToPolygons(ext.footprint, ext.w, ext.h, Math.max(1, ext.wallPx * 0.35), 20);
}

export { dilate };
