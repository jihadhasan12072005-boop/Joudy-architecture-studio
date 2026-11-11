import { describe, expect, it } from 'vitest';
import {
  buildMassMesh, massArea, massFromWorld, mergeMasses, rectangle, resolveRing, roofFrame, roofOffset, scaleMass, setMassSize,
  subtractFromMass, toLocal, toWorld, insertVertex, removeVertex, bbox, duplicateMass, ringArea, type Mass,
} from '../src/editor/geom';

const box = (x0: number, z0: number, x1: number, z1: number, p: Partial<Mass> = {}) => massFromWorld(rectangle(x0, z0, x1, z1), p);

describe('editor geometry', () => {
  it('mass from world polygon is centred and keeps its area', () => {
    const m = box(10, 10, 30, 20);
    expect(m.x).toBeCloseTo(20); expect(m.z).toBeCloseTo(15);
    expect(massArea(m)).toBeCloseTo(200);
  });
  it('world/local transforms round-trip with rotation', () => {
    const m = { ...box(0, 0, 10, 4), rot: 37 };
    const w = toWorld(m, [3, -1]);
    const l = toLocal(m, w);
    expect(l[0]).toBeCloseTo(3); expect(l[1]).toBeCloseTo(-1);
  });
  it('resize by numbers sets exact length and width', () => {
    const m = setMassSize(box(0, 0, 10, 4), 25, 12);
    const b = bbox(m.outline);
    expect(b.w).toBeCloseTo(25); expect(b.d).toBeCloseTo(12);
    expect(massArea(m)).toBeCloseTo(300);
  });
  it('scaling about an anchor keeps the anchor fixed', () => {
    const m = box(0, 0, 10, 10);
    const s = scaleMass(m, 2, 1, [-5, -5]);
    expect(bbox(s.outline).minX).toBeCloseTo(-5);
    expect(bbox(s.outline).maxX).toBeCloseTo(15);
  });
  it('corner rounding reduces area by ≈ (4 − π) r² for a rectangle', () => {
    const m = box(0, 0, 20, 10);
    const r = { ...m, radius: [3, 3, 3, 3] };
    const loss = massArea(m) - massArea(r);
    expect(loss).toBeGreaterThan((4 - Math.PI) * 9 * 0.8);
    expect(loss).toBeLessThan((4 - Math.PI) * 9 * 1.25);
  });
  it('edge bulge curves the wall outward (area grows ≈ 2/3 · chord · sagitta)', () => {
    const m = box(0, 0, 20, 10);
    const b = { ...m, bulge: [2, 0, 0, 0] };
    expect(massArea(b) - massArea(m)).toBeCloseTo((2 / 3) * 20 * 2, 0);
    const inward = { ...m, bulge: [-2, 0, 0, 0] };
    expect(massArea(inward)).toBeLessThan(massArea(m));
  });
  it('insert / remove vertex', () => {
    const m = insertVertex(box(0, 0, 10, 10), 0);
    expect(m.outline.length).toBe(5);
    expect(removeVertex(m, 1).outline.length).toBe(4);
  });
  it('roofs: shed rises along its direction, gable peaks in the middle, flat is zero', () => {
    const ring = rectangle(-5, -5, 5, 5);
    const f = roofFrame(ring, 0); // direction north (−z)
    const shed = { type: 'shed' as const, rise: 3, dir: 0, waves: 2 };
    expect(roofOffset(shed, f, [0, 5])).toBeCloseTo(0);
    expect(roofOffset(shed, f, [0, -5])).toBeCloseTo(3);
    expect(roofOffset({ ...shed, type: 'gable' }, f, [0, 0])).toBeCloseTo(3);
    expect(roofOffset({ ...shed, type: 'gable' }, f, [0, 5])).toBeCloseTo(0);
    expect(roofOffset({ ...shed, type: 'flat' }, f, [0, 0])).toBe(0);
    expect(roofOffset({ ...shed, type: 'dome' }, f, [0, 0])).toBeCloseTo(3);
    expect(roofOffset({ ...shed, type: 'barrel' }, f, [0, 0])).toBeCloseTo(3);
  });
  it('mesh: flat box has 12 triangles and reaches its height; curved roofs go higher', () => {
    const m = box(0, 0, 10, 10, { height: 7 });
    const mesh = buildMassMesh(m);
    expect(mesh.positions.length / 9).toBe(4 + 8); // 2 top + 2 bottom + 8 wall triangles
    expect(mesh.top).toBeCloseTo(7);
    const dome = buildMassMesh({ ...m, roof: { type: 'dome', rise: 4, dir: 0, waves: 2 } });
    expect(dome.top).toBeGreaterThan(10.5);
    expect(dome.positions.length).toBeGreaterThan(mesh.positions.length * 10);
  });
  it('merge: two touching boxes become one L/T shape; disconnected boxes are refused', () => {
    const a = box(0, 0, 10, 10, { height: 6 });
    const b = box(10, 0, 20, 5, { height: 9 });
    const m = mergeMasses([a, b])!;
    expect(m).not.toBeNull();
    expect(massArea(m)).toBeCloseTo(150, 1);
    expect(m.height).toBe(9);
    expect(mergeMasses([a, box(30, 30, 40, 40)])).toBeNull();
  });
  it('voids: subtracting an inner polygon creates a hole; cutting through splits the mass', () => {
    const a = box(0, 0, 30, 20);
    const withHole = subtractFromMass(a, rectangle(10, 5, 20, 15));
    expect(withHole.length).toBe(1);
    expect(withHole[0].holes.length).toBe(1);
    expect(massArea(withHole[0])).toBeCloseTo(600 - 100, 1);
    const split = subtractFromMass(a, rectangle(12, -5, 18, 25));
    expect(split.length).toBe(2);
    // closing the void = removing the hole
    expect(massArea({ ...withHole[0], holes: [] })).toBeCloseTo(600, 1);
  });
  it('rotated mass voids are computed in world space', () => {
    const a = { ...box(0, 0, 20, 20), rot: 45 };
    const r = subtractFromMass(a, rectangle(8, 8, 12, 12));
    expect(r[0].holes.length).toBe(1);
    expect(ringArea(r[0].holes[0])).toBeCloseTo(16, 1);
  });
  it('duplicate gets a new id and offset', () => {
    const a = box(0, 0, 5, 5);
    const d = duplicateMass(a);
    expect(d.id).not.toBe(a.id);
    expect(d.x).toBeCloseTo(a.x + 3);
  });
  it('resolveRing keeps simple polygons unchanged', () => {
    expect(resolveRing(rectangle(0, 0, 4, 3)).length).toBe(4);
  });
});
