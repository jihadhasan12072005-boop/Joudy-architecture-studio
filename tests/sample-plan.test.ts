/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { analyze, buildVolumes, extract, footprintBBox, heightField, resolve, DEFAULT_PARAMS } from '../src/lab/model';
import { polygonArea } from '../src/lab/trace';

// Regression test on the real browser-rendered sample plan (anti-aliased lines,
// window symbols, door arcs, Arabic labels, hatch, trees, dimension line, north arrow).
const dir = path.join(__dirname, 'fixtures');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'sample-plan.json'), 'utf8'));
const rgba = new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'sample-plan.rgba.gz'))));
const pxPerM = (30 * meta.w) / 1400;
const mPerPx = 1 / pxPerM;

describe('built-in sample plan (ground truth known)', () => {
  const ext = extract(rgba, meta.w, meta.h, DEFAULT_PARAMS);
  it('outline: bounding box 36 × 22 m, footprint 696 m² (L-shape incl. courtyard)', () => {
    const [x0, y0, x1, y1] = footprintBBox(ext);
    expect(Math.abs((x1 - x0) * mPerPx - 36)).toBeLessThan(0.3);
    expect(Math.abs((y1 - y0) * mPerPx - 22)).toBeLessThan(0.3);
    expect(Math.abs(ext.footprintPx * mPerPx * mPerPx - 696) / 696).toBeLessThan(0.01);
  });
  it('spaces: 7 rooms + 1 courtyard (suggested as void), doors found', () => {
    expect(ext.spaces.length).toBe(8);
    expect(ext.spaces.filter((s) => s.suggestedVoid).length).toBe(1);
    expect(ext.doors.length).toBeGreaterThanOrEqual(7);
  });
  it('courtyard area ≈ 10 × 6 m minus its walls', () => {
    const c = ext.spaces.find((s) => s.suggestedVoid)!;
    const a = c.area * mPerPx * mPerPx;
    expect(a).toBeGreaterThan(48);
    expect(a).toBeLessThan(60);
  });
  it('block massing keeps the courtyard as a hole and the notch in the outline', () => {
    const res = resolve(ext, [], 3);
    const v = buildVolumes(ext, heightField(ext, res), 'block', 3.2);
    expect(v[0].polys.length).toBe(1);
    expect(v[0].polys[0].holes.length).toBe(1);
    const built = polygonArea(v[0].polys[0]) * mPerPx * mPerPx;
    expect(built).toBeGreaterThan(696 - 62);
    expect(built).toBeLessThan(696 - 45);
    expect(v[0].polys[0].outer.length).toBeLessThan(20); // clean L-shape, not a staircase
    const m = analyze(ext, res, heightField(ext, res), mPerPx, []);
    expect(m.gfaM2 / m.footprintM2).toBeCloseTo(3, 1);
  });
});
