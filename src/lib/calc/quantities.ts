// Quantity takeoff helpers. Lengths in metres, areas m², volumes m³.
// These are measurement aids; the method of measurement (e.g. whether
// openings below a threshold are deducted) must follow your course /
// the specification you are working to.

export interface Opening {
  w: number;
  h: number;
  count: number;
}

export function openingsArea(openings: Opening[]): number {
  return openings.reduce((s, o) => s + Math.max(0, o.w) * Math.max(0, o.h) * Math.max(0, o.count), 0);
}

export function wallNetArea(length: number, height: number, openings: Opening[]): number {
  return Math.max(0, length * height - openingsArea(openings));
}

/**
 * Number of blocks per m² of wall face.
 * Block face dimensions and joint thickness in metres.
 */
export function blocksPerM2(blockL: number, blockH: number, joint: number): number {
  return 1 / ((blockL + joint) * (blockH + joint));
}

export function masonry(length: number, height: number, openings: Opening[], blockL: number, blockH: number, joint: number, wastePct: number) {
  const net = wallNetArea(length, height, openings);
  const perM2 = blocksPerM2(blockL, blockH, joint);
  const blocks = net * perM2 * (1 + wastePct / 100);
  return { grossArea: length * height, openings: openingsArea(openings), netArea: net, perM2, blocks: Math.ceil(blocks) };
}

export function tiles(area: number, tileL: number, tileW: number, wastePct: number) {
  const perM2 = 1 / (tileL * tileW);
  return { perM2, count: Math.ceil(area * perM2 * (1 + wastePct / 100)) };
}

export function paint(area: number, coats: number, coverageM2PerL: number) {
  return { litres: (area * coats) / coverageM2PerL };
}

export type ConcreteElementKind = 'footing' | 'column' | 'beam' | 'slab' | 'wall';

export interface ConcreteElement {
  id: string;
  kind: ConcreteElementKind;
  label: string;
  a: number; // length (m)
  b: number; // width / breadth (m)
  c: number; // depth / height / thickness (m)
  count: number;
}

export function elementVolume(e: ConcreteElement): number {
  return Math.max(0, e.a) * Math.max(0, e.b) * Math.max(0, e.c) * Math.max(0, e.count);
}

export function concreteTotals(elements: ConcreteElement[], wastePct: number) {
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const e of elements) {
    const v = elementVolume(e);
    byKind[e.kind] = (byKind[e.kind] ?? 0) + v;
    total += v;
  }
  return { byKind, net: total, withWaste: total * (1 + wastePct / 100) };
}

/**
 * Approximate formwork contact area for prismatic elements (m²).
 * footing: 4 sides; column: 4 sides; beam: 2 sides + soffit; slab: soffit + edges ignored;
 * wall: 2 faces.
 */
export function formworkArea(e: ConcreteElement): number {
  const { a, b, c, count } = e;
  switch (e.kind) {
    case 'footing':
      return 2 * (a + b) * c * count;
    case 'column':
      return 2 * (a + b) * c * count; // a,b = section, c = height
    case 'beam':
      return (2 * c + b) * a * count; // a = span, b = width, c = depth
    case 'slab':
      return a * b * count;
    case 'wall':
      return 2 * a * c * count; // a = length, c = height
  }
}
