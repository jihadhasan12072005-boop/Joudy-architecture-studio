import type { Project, SpaceRow, StageKey } from '../db/types';

export function siteArea(p: Project): number {
  if (p.siteAreaOverride > 0) return p.siteAreaOverride;
  return Math.max(0, p.siteWidth) * Math.max(0, p.siteDepth);
}

export function rowArea(r: SpaceRow): number {
  return Math.max(0, r.quantity) * Math.max(0, r.unitArea);
}

export interface ProgramSummary {
  net: number;
  circulation: number;
  walls: number;
  gross: number;
  efficiency: number; // net / gross
  byZone: { zoneId: string; area: number }[];
  byFloor: { floor: number; net: number; gross: number }[];
  occupants: number;
  site: number;
  far: number; // gross / site
  footprint: number; // largest floor gross
  coverage: number; // footprint / site
  warnings: string[];
}

/**
 * Net → gross: circulation is a % of net; walls/structure a % of (net + circulation).
 * Typical teaching ranges: circulation 15–35 % depending on type; walls 8–15 %.
 */
export function summarizeProgram(p: Project): ProgramSummary {
  const { spaces, circulationPct, wallsPct } = p.program;
  const net = spaces.reduce((s, r) => s + rowArea(r), 0);
  const factor = (1 + circulationPct / 100) * (1 + wallsPct / 100);
  const circulation = (net * circulationPct) / 100;
  const walls = ((net + circulation) * wallsPct) / 100;
  const gross = net + circulation + walls;
  const zoneMap = new Map<string, number>();
  const floorMap = new Map<number, number>();
  for (const r of spaces) {
    zoneMap.set(r.zoneId, (zoneMap.get(r.zoneId) ?? 0) + rowArea(r));
    floorMap.set(r.floor, (floorMap.get(r.floor) ?? 0) + rowArea(r));
  }
  const byFloor = [...floorMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, n]) => ({ floor, net: n, gross: n * factor }));
  const site = siteArea(p);
  const footprint = byFloor.reduce((m, f) => Math.max(m, f.floor >= 0 ? f.gross : 0), 0);
  const warnings: string[] = [];
  const far = site > 0 ? gross / site : 0;
  const coverage = site > 0 ? footprint / site : 0;
  if (p.program.maxFar > 0 && far > p.program.maxFar) warnings.push(`عامل الاستثمار ${far.toFixed(2)} يتجاوز الحد ${p.program.maxFar}.`);
  if (p.program.maxCoveragePct > 0 && coverage * 100 > p.program.maxCoveragePct)
    warnings.push(`نسبة التغطية ${(coverage * 100).toFixed(0)}٪ تتجاوز الحد ${p.program.maxCoveragePct}٪.`);
  if (site > 0 && footprint > site) warnings.push('مساحة أكبر طابق أكبر من مساحة الموقع.');
  const usedFloors = new Set(spaces.map((s) => s.floor));
  const allowed = p.floors + p.basements;
  if (usedFloors.size > allowed) warnings.push('عدد الطوابق المستعملة في الجدول أكبر من عدد طوابق المشروع.');
  return {
    net,
    circulation,
    walls,
    gross,
    efficiency: gross > 0 ? net / gross : 0,
    byZone: [...zoneMap.entries()].map(([zoneId, area]) => ({ zoneId, area })),
    byFloor,
    occupants: spaces.reduce((s, r) => s + Math.max(0, r.occupants) * Math.max(0, r.quantity), 0),
    site,
    far,
    footprint,
    coverage,
    warnings,
  };
}

export function adjacencyKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ---------------------------------------------------------------------------
// Stage progress — combines objective signals with Joudy's own "done" flag.
// ---------------------------------------------------------------------------
export const STAGES: { key: StageKey; num: number; ar: string; en: string }[] = [
  { key: 'site', num: 1, ar: 'تحليل الموقع', en: 'Site Analysis' },
  { key: 'concept', num: 2, ar: 'تطوير الفكرة', en: 'Concept Development' },
  { key: 'program', num: 3, ar: 'البرنامج والمساحات', en: 'Space Planning' },
  { key: 'drawings', num: 4, ar: 'المخططات', en: 'Architectural Drawings' },
  { key: 'review', num: 5, ar: 'المراجعة التصميمية', en: 'Design Review' },
  { key: 'presentation', num: 6, ar: 'العرض النهائي', en: 'Final Presentation' },
];

export function stageProgress(p: Project, fileCount: number): Record<StageKey, number> {
  const filled = (vals: (string | number | unknown[])[]) =>
    vals.filter((v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v > 0 : String(v).trim() !== '')).length /
    vals.length;
  const s = p.site;
  const raw: Record<StageKey, number> = {
    site: filled([s.topography, s.climateNotes, s.accessPoints, s.surroundings, s.views, s.opportunities, s.constraints, s.environmental]),
    concept: filled([p.concept.statement, p.concept.options, p.concept.log]) * (p.concept.options.some((o) => o.chosen) ? 1 : 0.8),
    program: Math.min(1, p.program.spaces.length / 6) * (Object.keys(p.program.adjacency).length > 0 ? 1 : 0.8),
    drawings: Math.min(1, fileCount / 6),
    review: Math.min(1, p.reviews.length / 2),
    presentation: filled([p.presentation.conceptStatement, p.presentation.description, p.presentation.boards, p.presentation.milestones]),
  };
  const out = {} as Record<StageKey, number>;
  for (const st of STAGES) out[st.key] = p.stageDone[st.key] ? 1 : Math.min(0.95, raw[st.key]);
  return out;
}

export function overallProgress(p: Project, fileCount: number): number {
  const sp = stageProgress(p, fileCount);
  const vals = Object.values(sp);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
