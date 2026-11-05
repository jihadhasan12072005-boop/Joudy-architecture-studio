// Unit conversion. Each unit has a factor to the SI base unit of its category.

export interface Unit {
  id: string;
  label: string;
  factor: number; // multiply by factor to get SI base
}

export interface UnitCategory {
  id: string;
  label: string;
  base: string;
  units: Unit[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'الطول — Length',
    base: 'm',
    units: [
      { id: 'mm', label: 'mm ملم', factor: 0.001 },
      { id: 'cm', label: 'cm سم', factor: 0.01 },
      { id: 'm', label: 'm متر', factor: 1 },
      { id: 'km', label: 'km كم', factor: 1000 },
      { id: 'in', label: 'in إنش', factor: 0.0254 },
      { id: 'ft', label: 'ft قدم', factor: 0.3048 },
      { id: 'yd', label: 'yd ياردة', factor: 0.9144 },
    ],
  },
  {
    id: 'area',
    label: 'المساحة — Area',
    base: 'm²',
    units: [
      { id: 'cm2', label: 'cm² سم²', factor: 1e-4 },
      { id: 'm2', label: 'm² م²', factor: 1 },
      { id: 'dunam', label: 'دونم (1000 م²)', factor: 1000 },
      { id: 'ha', label: 'ha هكتار', factor: 10000 },
      { id: 'km2', label: 'km² كم²', factor: 1e6 },
      { id: 'ft2', label: 'ft² قدم²', factor: 0.09290304 },
      { id: 'acre', label: 'acre فدان إنكليزي', factor: 4046.8564224 },
    ],
  },
  {
    id: 'volume',
    label: 'الحجم — Volume',
    base: 'm³',
    units: [
      { id: 'l', label: 'L ليتر', factor: 0.001 },
      { id: 'm3', label: 'm³ م³', factor: 1 },
      { id: 'cm3', label: 'cm³ سم³', factor: 1e-6 },
      { id: 'ft3', label: 'ft³ قدم³', factor: 0.028316846592 },
    ],
  },
  {
    id: 'mass',
    label: 'الكتلة — Mass',
    base: 'kg',
    units: [
      { id: 'g', label: 'g غرام', factor: 0.001 },
      { id: 'kg', label: 'kg كغ', factor: 1 },
      { id: 't', label: 't طن', factor: 1000 },
      { id: 'lb', label: 'lb باوند', factor: 0.45359237 },
    ],
  },
  {
    id: 'force',
    label: 'القوة — Force',
    base: 'N',
    units: [
      { id: 'N', label: 'N نيوتن', factor: 1 },
      { id: 'kN', label: 'kN كيلونيوتن', factor: 1000 },
      { id: 'kgf', label: 'kgf كغ.ق', factor: 9.80665 },
      { id: 'tf', label: 'tf طن.ق', factor: 9806.65 },
      { id: 'lbf', label: 'lbf', factor: 4.4482216152605 },
      { id: 'kip', label: 'kip', factor: 4448.2216152605 },
    ],
  },
  {
    id: 'stress',
    label: 'الإجهاد والضغط — Stress / Pressure',
    base: 'Pa',
    units: [
      { id: 'Pa', label: 'Pa باسكال', factor: 1 },
      { id: 'kPa', label: 'kPa = kN/m²', factor: 1000 },
      { id: 'MPa', label: 'MPa = N/mm²', factor: 1e6 },
      { id: 'kgcm2', label: 'kg/cm² كغ/سم²', factor: 98066.5 },
      { id: 'tm2', label: 't/m² طن/م²', factor: 9806.65 },
      { id: 'psi', label: 'psi', factor: 6894.757293168 },
      { id: 'bar', label: 'bar', factor: 1e5 },
    ],
  },
  {
    id: 'moment',
    label: 'العزم — Moment',
    base: 'N·m',
    units: [
      { id: 'Nm', label: 'N·m', factor: 1 },
      { id: 'kNm', label: 'kN·m', factor: 1000 },
      { id: 'tm', label: 't·m طن.م', factor: 9806.65 },
      { id: 'kgcm', label: 'kg·cm', factor: 0.0980665 },
      { id: 'kipft', label: 'kip·ft', factor: 1355.8179483314 },
    ],
  },
  {
    id: 'lineload',
    label: 'الحمل الخطي — Line load',
    base: 'N/m',
    units: [
      { id: 'kNm', label: 'kN/m', factor: 1000 },
      { id: 'tm', label: 't/m طن/م', factor: 9806.65 },
      { id: 'kgm', label: 'kg/m كغ/م', factor: 9.80665 },
    ],
  },
  {
    id: 'density',
    label: 'الكثافة — Density',
    base: 'kg/m³',
    units: [
      { id: 'kgm3', label: 'kg/m³', factor: 1 },
      { id: 'tm3', label: 't/m³', factor: 1000 },
      { id: 'gcm3', label: 'g/cm³', factor: 1000 },
    ],
  },
  {
    id: 'unitweight',
    label: 'الوزن الحجمي — Unit weight',
    base: 'N/m³',
    units: [
      { id: 'kNm3', label: 'kN/m³', factor: 1000 },
      { id: 'tm3', label: 't/m³ (ثقلي)', factor: 9806.65 },
    ],
  },
  {
    id: 'temperature',
    label: 'الحرارة — Temperature',
    base: 'K',
    units: [
      { id: 'C', label: '°C مئوية', factor: NaN },
      { id: 'F', label: '°F فهرنهايت', factor: NaN },
      { id: 'K', label: 'K كلفن', factor: NaN },
    ],
  },
];

function toKelvin(v: number, u: string): number {
  if (u === 'C') return v + 273.15;
  if (u === 'F') return ((v - 32) * 5) / 9 + 273.15;
  return v;
}
function fromKelvin(k: number, u: string): number {
  if (u === 'C') return k - 273.15;
  if (u === 'F') return ((k - 273.15) * 9) / 5 + 32;
  return k;
}

export function convert(value: number, categoryId: string, from: string, to: string): number {
  const cat = UNIT_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) throw new Error('Unknown category');
  if (categoryId === 'temperature') return fromKelvin(toKelvin(value, from), to);
  const f = cat.units.find((u) => u.id === from);
  const t = cat.units.find((u) => u.id === to);
  if (!f || !t) throw new Error('Unknown unit');
  return (value * f.factor) / t.factor;
}
