// Building materials & thermal transmittance (U-value).
// Method: ISO 6946 simplified — R_total = Rsi + Σ(d/λ) + Rse, U = 1/R_total.
// Surface resistances for horizontal heat flow (walls): Rsi = 0.13, Rse = 0.04 m²K/W.
// Material λ values are TYPICAL design values (ISO 10456 / CIBSE Guide A ranges).
// Real products vary with density and moisture — use the manufacturer's
// declared value when you have it.

export interface Material {
  id: string;
  ar: string;
  en: string;
  density: number; // kg/m³ (typical)
  lambda: number; // W/(m·K) (typical design value)
  lambdaRange: string;
  notes: string;
}

export const MATERIALS: Material[] = [
  { id: 'rc', ar: 'بيتون مسلح', en: 'Reinforced concrete (≈1% steel)', density: 2400, lambda: 2.3, lambdaRange: '2.3–2.5', notes: 'كتلة حرارية عالية، عزل ضعيف.' },
  { id: 'pc', ar: 'بيتون عادي', en: 'Plain dense concrete', density: 2300, lambda: 1.65, lambdaRange: '1.35–2.0', notes: 'تتغير القيمة مع الكثافة والرطوبة.' },
  { id: 'block-hollow', ar: 'بلوك بيتوني مفرغ', en: 'Hollow concrete block (equivalent)', density: 1300, lambda: 0.9, lambdaRange: '0.6–1.2 (مكافئ)', notes: 'قيمة مكافئة للبلوكة كاملة؛ تختلف حسب عدد الفراغات والسماكة.' },
  { id: 'brick', ar: 'آجر (طوب أحمر)', en: 'Clay brick', density: 1800, lambda: 0.77, lambdaRange: '0.6–0.9', notes: '' },
  { id: 'aac', ar: 'بيتون خلوي (أيتونغ)', en: 'Autoclaved aerated concrete', density: 500, lambda: 0.14, lambdaRange: '0.11–0.18', notes: 'عازل جيد نسبياً، قدرة حمل منخفضة.' },
  { id: 'limestone', ar: 'حجر كلسي متوسط', en: 'Limestone (firm)', density: 2000, lambda: 1.4, lambdaRange: '1.1–1.7', notes: 'الحجر الكلسي الصلب جداً يصل إلى ≈2.3.' },
  { id: 'basalt', ar: 'حجر بازلتي', en: 'Basalt', density: 2850, lambda: 3.5, lambdaRange: '≈3.5 (صخور نارية)', notes: '' },
  { id: 'cement-plaster', ar: 'زريقة إسمنتية', en: 'Cement-sand render', density: 1800, lambda: 1.0, lambdaRange: '0.8–1.0', notes: '' },
  { id: 'gypsum-plaster', ar: 'لياسة جبسية', en: 'Gypsum plaster', density: 1200, lambda: 0.43, lambdaRange: '0.4–0.57', notes: '' },
  { id: 'eps', ar: 'بوليسترين ممدد (فلين)', en: 'EPS insulation', density: 20, lambda: 0.037, lambdaRange: '0.031–0.040', notes: 'يحتاج حماية من النار والأشعة.' },
  { id: 'xps', ar: 'بوليسترين مبثوق', en: 'XPS insulation', density: 35, lambda: 0.034, lambdaRange: '0.029–0.036', notes: 'مقاوم للرطوبة — مناسب للأسطح المقلوبة.' },
  { id: 'mineral-wool', ar: 'صوف صخري/زجاجي', en: 'Mineral wool', density: 40, lambda: 0.037, lambdaRange: '0.032–0.040', notes: 'غير قابل للاشتعال.' },
  { id: 'timber', ar: 'خشب طري', en: 'Softwood timber', density: 500, lambda: 0.13, lambdaRange: '0.12–0.14', notes: '' },
  { id: 'glass', ar: 'زجاج', en: 'Glass (sheet)', density: 2500, lambda: 1.0, lambdaRange: '≈1.0', notes: 'أداء النافذة يُقاس بـ U للنافذة ككل، لا بسماكة الزجاج.' },
  { id: 'steel', ar: 'فولاذ', en: 'Steel', density: 7800, lambda: 50, lambdaRange: '45–50', notes: 'جسر حراري قوي.' },
  { id: 'aluminium', ar: 'ألمنيوم', en: 'Aluminium', density: 2700, lambda: 160, lambdaRange: '160–230', notes: 'يتطلب قطعاً حرارياً في الإطارات.' },
  { id: 'air-cavity', ar: 'فراغ هوائي غير مهوّى (5 سم)', en: 'Unventilated air cavity 50 mm', density: 1, lambda: 0.278, lambdaRange: 'R≈0.18 m²K/W', notes: 'مدخلة كقيمة مكافئة تعطي R≈0.18 لسماكة 5 سم (ISO 6946).' },
];

export const RSI_WALL = 0.13;
export const RSE_WALL = 0.04;

export interface Layer {
  id: string;
  materialId: string;
  thicknessMm: number;
  lambdaOverride?: number;
}

export function layerResistance(l: Layer): number {
  const m = MATERIALS.find((x) => x.id === l.materialId);
  const lambda = l.lambdaOverride && l.lambdaOverride > 0 ? l.lambdaOverride : m?.lambda ?? NaN;
  return l.thicknessMm / 1000 / lambda;
}

export function uValue(layers: Layer[], rsi = RSI_WALL, rse = RSE_WALL) {
  const parts = layers.map((l) => ({ id: l.id, R: layerResistance(l) }));
  const R = rsi + rse + parts.reduce((s, p) => s + p.R, 0);
  const massPerM2 = layers.reduce((s, l) => {
    const m = MATERIALS.find((x) => x.id === l.materialId);
    return s + (m ? (m.density * l.thicknessMm) / 1000 : 0);
  }, 0);
  return { parts, R, U: 1 / R, massPerM2, thicknessMm: layers.reduce((s, l) => s + l.thicknessMm, 0) };
}
