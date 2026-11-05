// Reinforced-concrete practice calculations — EDUCATIONAL ONLY.
// Design approach: ACI 318-19 strength design (rectangular stress block).
// The Syrian Arab Code for RC is largely based on the same ultimate-strength
// methodology, but coefficients (load factors, φ factors, minimum steel) may
// differ: always follow the code and assumptions taught in your course.
// Units: mm, MPa (N/mm²), kN, kN·m.

export const ES = 200000; // MPa, steel modulus

export function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7);
}

export interface SectionInput {
  b: number; // mm
  d: number; // effective depth, mm
  As: number; // mm²
  fc: number; // MPa
  fy: number; // MPa
}

export interface SectionResult {
  a: number;
  c: number;
  beta1: number;
  epsT: number;
  epsTy: number;
  steelYields: boolean;
  phi: number;
  classification: 'tension-controlled' | 'transition' | 'compression-controlled';
  Mn: number; // kN·m
  phiMn: number; // kN·m
  rho: number;
  AsMin: number;
  meetsAsMin: boolean;
  meetsBeamStrainLimit: boolean; // ACI 318-19 §9.3.3.1: εt ≥ 0.004
  notes: string[];
}

/** Flexural capacity of a singly-reinforced rectangular section. */
export function singlyReinforcedCapacity(s: SectionInput): SectionResult {
  for (const [k, v] of Object.entries(s)) {
    if (!(v > 0)) throw new Error(`القيمة ${k} يجب أن تكون موجبة.`);
  }
  const b1 = beta1(s.fc);
  const a = (s.As * s.fy) / (0.85 * s.fc * s.b);
  const c = a / b1;
  const epsT = (0.003 * (s.d - c)) / c;
  const epsTy = s.fy / ES;
  const tcLimit = epsTy + 0.003; // ACI 318-19 Table 21.2.2
  let phi: number;
  let classification: SectionResult['classification'];
  if (epsT >= tcLimit) {
    phi = 0.9;
    classification = 'tension-controlled';
  } else if (epsT <= epsTy) {
    phi = 0.65;
    classification = 'compression-controlled';
  } else {
    phi = 0.65 + (0.25 * (epsT - epsTy)) / (tcLimit - epsTy);
    classification = 'transition';
  }
  const Mn = (s.As * s.fy * (s.d - a / 2)) / 1e6;
  const AsMin = Math.max((0.25 * Math.sqrt(s.fc)) / s.fy, 1.4 / s.fy) * s.b * s.d;
  const notes: string[] = [];
  const steelYields = epsT >= epsTy;
  if (!steelYields) notes.push('الحديد لا يصل للخضوع: معادلة Mn = As·fy·(d − a/2) لا تنطبق كما هي (مقطع مفرط التسليح).');
  if (s.As < AsMin) notes.push('التسليح أقل من الحد الأدنى As,min.');
  if (epsT < 0.004) notes.push('εt < 0.004: لا يحقق حد الانفعال الأدنى للجوائز حسب ACI 318-19 (9.3.3.1).');
  return {
    a,
    c,
    beta1: b1,
    epsT,
    epsTy,
    steelYields,
    phi,
    classification,
    Mn,
    phiMn: phi * Mn,
    rho: s.As / (s.b * s.d),
    AsMin,
    meetsAsMin: s.As >= AsMin,
    meetsBeamStrainLimit: epsT >= 0.004,
    notes,
  };
}

/**
 * Required tension steel for a factored moment Mu (kN·m), assuming
 * tension-controlled behaviour (φ = 0.9) — verify afterwards with
 * singlyReinforcedCapacity().
 */
export function requiredSteel(MukNm: number, b: number, d: number, fc: number, fy: number) {
  const phi = 0.9;
  const Rn = (MukNm * 1e6) / (phi * b * d * d); // MPa
  const inside = 1 - (2 * Rn) / (0.85 * fc);
  if (inside < 0) {
    return { Rn, rho: NaN, As: NaN, ok: false, message: 'المقطع صغير جداً لهذا العزم: كبّري المقطع أو استعملي تسليحاً مزدوجاً.' };
  }
  const rho = ((0.85 * fc) / fy) * (1 - Math.sqrt(inside));
  const AsMin = Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy) * b * d;
  const As = Math.max(rho * b * d, AsMin);
  return { Rn, rho, As, AsMin, governedByMin: rho * b * d < AsMin, ok: true, message: '' };
}

/** Area of n bars of diameter dia (mm). */
export function barsArea(n: number, dia: number): number {
  return (n * Math.PI * dia * dia) / 4;
}

// ---------------------------------------------------------------------------
// Simple beam actions (linear elastic statics)
// ---------------------------------------------------------------------------
export type BeamCase = 'simply-udl' | 'simply-point-mid' | 'cantilever-udl' | 'cantilever-point-end';

/** Max moment (kN·m) and max shear (kN). w in kN/m, P in kN, L in m. */
export function beamActions(kind: BeamCase, L: number, load: number) {
  switch (kind) {
    case 'simply-udl':
      return { M: (load * L * L) / 8, V: (load * L) / 2, formulaM: 'wL²/8', formulaV: 'wL/2' };
    case 'simply-point-mid':
      return { M: (load * L) / 4, V: load / 2, formulaM: 'PL/4', formulaV: 'P/2' };
    case 'cantilever-udl':
      return { M: (load * L * L) / 2, V: load * L, formulaM: 'wL²/2', formulaV: 'wL' };
    case 'cantilever-point-end':
      return { M: load * L, V: load, formulaM: 'PL', formulaV: 'P' };
  }
}

/** ACI 318-19 basic factored load combination 1.2D + 1.6L (and 1.4D). */
export function factoredLoad(dead: number, live: number) {
  const c1 = 1.4 * dead;
  const c2 = 1.2 * dead + 1.6 * live;
  return { c1, c2, governing: Math.max(c1, c2) };
}

// ---------------------------------------------------------------------------
// Concrete mix quantities
// ---------------------------------------------------------------------------
export const CEMENT_BULK_DENSITY = 1440; // kg/m³ (loose bulk, common textbook value)
export const DRY_VOLUME_FACTOR = 1.54; // wet → dry volume (common textbook value 1.52–1.57)

/** Nominal mix by volume, e.g. 1 : 2 : 4. */
export function mixByRatio(wetVolume: number, c: number, s: number, g: number, wc = 0.5, bagKg = 50) {
  const dry = wetVolume * DRY_VOLUME_FACTOR;
  const sum = c + s + g;
  const cementVol = (dry * c) / sum;
  const cementKg = cementVol * CEMENT_BULK_DENSITY;
  return {
    dryVolume: dry,
    cementKg,
    cementBags: cementKg / bagKg,
    sandM3: (dry * s) / sum,
    gravelM3: (dry * g) / sum,
    waterL: cementKg * wc,
  };
}

/** Mix by cement dosage (kg per m³ of concrete), as specified in many Syrian BOQs. */
export function mixByDosage(wetVolume: number, dosageKg: number, sandPerM3: number, gravelPerM3: number, wc = 0.5, bagKg = 50) {
  const cementKg = wetVolume * dosageKg;
  return {
    cementKg,
    cementBags: cementKg / bagKg,
    sandM3: wetVolume * sandPerM3,
    gravelM3: wetVolume * gravelPerM3,
    waterL: cementKg * wc,
  };
}
