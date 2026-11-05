// Scale, area and basic measurement helpers. All lengths in metres unless
// stated; paper lengths in millimetres.

export const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000];

/** Real length (m) -> length on paper (mm) at 1:den. */
export function realToPaper(realM: number, den: number): number {
  return (realM * 1000) / den;
}

/** Length measured on paper (mm) at 1:den -> real length (m). */
export function paperToReal(paperMm: number, den: number): number {
  return (paperMm * den) / 1000;
}

/** Convert a paper measurement from one scale to another (mm). */
export function rescale(paperMm: number, fromDen: number, toDen: number): number {
  return (paperMm * fromDen) / toDen;
}

export interface PaperSize {
  name: string;
  w: number; // mm (landscape long side)
  h: number;
}

export const PAPER_SIZES: PaperSize[] = [
  { name: 'A0', w: 1189, h: 841 },
  { name: 'A1', w: 841, h: 594 },
  { name: 'A2', w: 594, h: 420 },
  { name: 'A3', w: 420, h: 297 },
  { name: 'A4', w: 297, h: 210 },
];

/**
 * Smallest standard scale denominator (largest drawing) at which an object of
 * lengthM × widthM fits on the paper with the given margin on every side.
 * Orientation is chosen automatically.
 */
export function fitScale(lengthM: number, widthM: number, paper: PaperSize, marginMm: number): number | null {
  const pw = paper.w - 2 * marginMm;
  const ph = paper.h - 2 * marginMm;
  if (pw <= 0 || ph <= 0 || lengthM <= 0 || widthM <= 0) return null;
  const long = Math.max(lengthM, widthM) * 1000;
  const short = Math.min(lengthM, widthM) * 1000;
  for (const den of STANDARD_SCALES) {
    if (long / den <= pw && short / den <= ph) return den;
  }
  return null;
}

export interface Pt {
  x: number;
  y: number;
}

/** Shoelace formula. Points in order (clockwise or anti-clockwise). */
export function polygonArea(points: Pt[]): number {
  if (points.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeter(points: Pt[]): number {
  if (points.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

/** Area of a triangle from three side lengths (Heron). Returns NaN if impossible. */
export function heron(a: number, b: number, c: number): number {
  const s = (a + b + c) / 2;
  const v = s * (s - a) * (s - b) * (s - c);
  return v < 0 ? NaN : Math.sqrt(v);
}

export const areas = {
  rectangle: (l: number, w: number) => l * w,
  triangle: (base: number, h: number) => (base * h) / 2,
  trapezoid: (a: number, b: number, h: number) => ((a + b) / 2) * h,
  circle: (r: number) => Math.PI * r * r,
  sector: (r: number, angleDeg: number) => (Math.PI * r * r * angleDeg) / 360,
};

// ---------------------------------------------------------------------------
// Slopes & ramps
// ---------------------------------------------------------------------------
export function slopeFromPercent(pct: number) {
  return { percent: pct, degrees: (Math.atan(pct / 100) * 180) / Math.PI, ratio: pct === 0 ? Infinity : 100 / pct };
}
export function slopeFromDegrees(d: number) {
  return slopeFromPercent(Math.tan((d * Math.PI) / 180) * 100);
}
export function slopeFromRatio(n: number) {
  // 1 : n  (rise : run)
  return slopeFromPercent(n === 0 ? Infinity : 100 / n);
}

/** Horizontal run needed to climb `rise` at a slope of 1:n. */
export function rampRun(rise: number, n: number): number {
  return rise * n;
}

export function hypotenuse(a: number, b: number): number {
  return Math.hypot(a, b);
}
