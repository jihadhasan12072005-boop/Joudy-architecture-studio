// Stair geometry — educational design aid.
// Basis: Blondel's comfort rule 2R + T ≈ 63 cm (accepted range ≈ 60–65 cm),
// as presented in Neufert "Architects' Data". Limits below are common design
// guidance; the Syrian building code / your professor's brief may set
// different limits — always check them.

export interface StairInput {
  floorHeightCm: number; // finished floor to finished floor
  maxRiserCm: number; // e.g. 17.5 residential, 16 public
  blondelTargetCm: number; // usually 63
  maxRisersPerFlight: number; // commonly 16–18
  widthCm: number; // clear stair width (landing depth >= width)
}

export interface StairResult {
  risers: number;
  riserCm: number;
  treadCm: number;
  treads: number;
  blondelCm: number;
  pitchDeg: number;
  flights: number;
  risersPerFlight: number[];
  runPerFlightCm: number[];
  landings: number;
  totalRunCm: number; // treads only (horizontal going), excluding landings
  totalRunWithLandingsCm: number;
  warnings: string[];
}

export function designStair(i: StairInput): StairResult {
  if (!(i.floorHeightCm > 0) || !(i.maxRiserCm > 0)) throw new Error('أدخلي ارتفاعاً وارتفاع قائمة موجبين.');
  const risers = Math.ceil(i.floorHeightCm / i.maxRiserCm - 1e-9);
  const riserCm = i.floorHeightCm / risers;
  // Round tread to nearest 0.5 cm, as detailing practice.
  const treadCm = Math.round((i.blondelTargetCm - 2 * riserCm) * 2) / 2;
  const flights = Math.max(1, Math.ceil(risers / Math.max(1, i.maxRisersPerFlight)));
  const base = Math.floor(risers / flights);
  const extra = risers % flights;
  const risersPerFlight = Array.from({ length: flights }, (_, k) => base + (k < extra ? 1 : 0));
  // In each flight the number of treads is one less than the risers (the top
  // step is the landing / floor).
  const runPerFlightCm = risersPerFlight.map((r) => (r - 1) * treadCm);
  const treads = risers - flights;
  const totalRunCm = treads * treadCm;
  const landings = flights - 1;
  const warnings: string[] = [];
  if (riserCm > 19) warnings.push('ارتفاع القائمة أكبر من 19 سم — غير مريح وغالباً غير مسموح.');
  if (riserCm < 14) warnings.push('ارتفاع القائمة أقل من 14 سم — قد يسبب تعثراً.');
  if (treadCm < 25) warnings.push('عرض النائمة أقل من 25 سم — صغير جداً لمعظم الاستعمالات.');
  if (treadCm > 35) warnings.push('عرض النائمة أكبر من 35 سم — يخلّ بإيقاع الخطوة.');
  const blondel = 2 * riserCm + treadCm;
  if (blondel < 60 || blondel > 65) warnings.push('معادلة بلوندل خارج المجال 60–65 سم.');
  if (i.widthCm < 90) warnings.push('عرض الدرج أقل من 90 سم — أقل من الحد الشائع للدرج السكني.');
  return {
    risers,
    riserCm,
    treadCm,
    treads,
    blondelCm: blondel,
    pitchDeg: (Math.atan(riserCm / treadCm) * 180) / Math.PI,
    flights,
    risersPerFlight,
    runPerFlightCm,
    landings,
    totalRunCm,
    totalRunWithLandingsCm: totalRunCm + landings * i.widthCm,
    warnings,
  };
}
