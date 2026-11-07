import { describe, expect, it } from 'vitest';
import { analyze, buildVolumes, extract, heightField, resolve, variants, elevationProfile, sectionProfile, sideOrientation, scaleFromReference, DEFAULT_PARAMS } from '../src/lab/model';
import { polygonArea } from '../src/lab/trace';

/** Synthetic courtyard plan (400×300 px): 6 px walls, 10 px door gaps, 1 px furniture/text/dimension lines. */
export function samplePlan() {
  const w = 400, h = 300;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number, v = 30) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; }
  };
  const clear = (x0: number, y0: number, x1: number, y1: number) => rect(x0, y0, x1, y1, 255);
  // outer walls 40..360 × 40..260
  rect(40, 40, 360, 46); rect(40, 254, 360, 260); rect(40, 40, 46, 260); rect(354, 40, 360, 260);
  // courtyard walls 130..270 × 100..200
  rect(130, 100, 270, 106); rect(130, 194, 270, 200); rect(130, 100, 136, 200); rect(264, 100, 270, 200);
  // pinwheel partitions
  rect(130, 46, 136, 100); rect(264, 200, 270, 254); rect(270, 100, 354, 106); rect(46, 194, 130, 200);
  // doors (10 px gaps) in partitions + entrance in outer wall
  clear(130, 60, 136, 70); clear(264, 220, 270, 230); clear(300, 100, 310, 106); clear(80, 194, 90, 200); clear(80, 254, 90, 260);
  // thin lines: furniture rectangle, "text", dimension line outside
  for (let x = 60; x < 110; x++) { rect(x, 70, x + 1, 71); rect(x, 90, x + 1, 91); }
  for (let y = 70; y < 91; y++) { rect(60, y, 61, y + 1); rect(110, y, 111, y + 1); }
  for (let x = 40; x < 360; x++) rect(x, 280, x + 1, 281);
  rect(200, 150, 230, 151); // "text" stroke inside courtyard
  return { px, w, h };
}

describe('plan extraction', () => {
  const { px, w, h } = samplePlan();
  const ext = extract(px, w, h, DEFAULT_PARAMS);

  it('finds the true footprint (ignores thin dimension line, bridges the entrance)', () => {
    expect(ext.footprintPx).toBeGreaterThan(320 * 220 * 0.98);
    expect(ext.footprintPx).toBeLessThan(320 * 220 * 1.02);
  });
  it('finds 4 rooms + 1 courtyard, suggests the courtyard as a void', () => {
    expect(ext.spaces.length).toBe(5);
    const voids = ext.spaces.filter((s) => s.suggestedVoid);
    expect(voids.length).toBe(1);
    expect(voids[0].area).toBeGreaterThan(128 * 88 * 0.95);
  });
  it('detects door connections between the rooms', () => {
    expect(ext.doors.length).toBeGreaterThanOrEqual(4);
  });
  it('estimates wall thickness ≈ 6 px', () => {
    expect(ext.wallPx).toBeGreaterThan(4);
    expect(ext.wallPx).toBeLessThan(9);
  });

  const res = resolve(ext, [], 2);
  const field = heightField(ext, res);

  it('block massing = footprint ring with the courtyard as a hole', () => {
    const v = buildVolumes(ext, field, 'block', 3.2);
    expect(v.length).toBe(1);
    expect(v[0].polys.length).toBe(1);
    expect(v[0].polys[0].holes.length).toBe(1);
    const a = polygonArea(v[0].polys[0]);
    const expected = 320 * 220 - 128 * 88;
    expect(Math.abs(a - expected) / expected).toBeLessThan(0.03);
    expect(v[0].z1).toBeCloseTo(6.4);
  });
  it('per-space heights produce several volumes; exploded produces one plate per floor', () => {
    const vs = variants(ext, res, 2);
    const tower = vs.find((x) => x.key === 'tower')!;
    const r2 = { ...res, floors: tower.floors };
    const f2 = heightField(ext, r2);
    expect(buildVolumes(ext, f2, 'volumetric', 3).length).toBe(2);
    expect(buildVolumes(ext, f2, 'exploded', 3).length).toBe(Math.max(...tower.floors.slice(1).filter((_, i) => res.role[i + 1] !== 'void')));
    expect(vs.some((x) => x.key === 'court')).toBe(true);
  });
  it('analysis with a measured scale: areas, facades, travel distances', () => {
    const scale = scaleFromReference([40, 40], [360, 40], 32); // 320 px = 32 m → 0.1 m/px
    expect(scale.mPerPx).toBeCloseTo(0.1);
    const m = analyze(ext, res, field, scale.mPerPx, [[85, 258]]);
    expect(m.footprintM2).toBeGreaterThan(560);
    expect(m.footprintM2).toBeLessThan(600); // 704 − 112.6 ≈ 591
    expect(m.courtyardM2).toBeCloseTo(112.6, 0);
    expect(m.gfaM2).toBeCloseTo(m.footprintM2 * 2, 0);
    const rooms = m.spaces.filter((s) => s.role !== 'void');
    expect(rooms.every((s) => s.hasFacade)).toBe(true);
    expect(rooms.every((s) => s.reachable)).toBe(true);
    expect(m.maxTravelM!).toBeGreaterThan(10);
  });
  it('elevations and sections', () => {
    const e = elevationProfile(ext, field, 'bottom');
    expect(Math.max(...e)).toBe(2);
    expect(e.filter((v) => v > 0).length).toBeGreaterThan(310);
    const s = sectionProfile(ext, field, 'h', 0.5);
    expect(s.cut[200]).toBe(0); // courtyard
    expect(s.cut[100]).toBe(2);
    expect(sideOrientation('bottom', 0)).toBe('S');
    expect(sideOrientation('top', 90)).toBe('W');
  });
});
