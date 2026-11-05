import { useState } from 'react';
import { NumField, Note, Segmented, Select, Stat, NumInput } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { designStair } from '../../lib/calc/stairs';
import { concreteTotals, elementVolume, formworkArea, masonry, paint, tiles, type ConcreteElement, type ConcreteElementKind, type Opening } from '../../lib/calc/quantities';
import { barsArea, beamActions, factoredLoad, mixByDosage, mixByRatio, requiredSteel, singlyReinforcedCapacity, type BeamCase } from '../../lib/calc/concrete';
import { MATERIALS, RSE_WALL, RSI_WALL, uValue, type Layer } from '../../lib/calc/thermal';
import { fmt } from '../../lib/format';
import { uid } from '../../lib/id';

// ---------------------------------------------------------------------------
export function StairTool() {
  const [H, setH] = useState(320);
  const [maxR, setMaxR] = useState(17.5);
  const [blondel, setBlondel] = useState(63);
  const [perFlight, setPerFlight] = useState(16);
  const [width, setWidth] = useState(120);
  let r: ReturnType<typeof designStair> | null = null;
  let err = '';
  try {
    r = designStair({ floorHeightCm: H, maxRiserCm: maxR, blondelTargetCm: blondel, maxRisersPerFlight: perFlight, widthCm: width });
  } catch (e) {
    err = (e as Error).message;
  }
  // Section sketch of first flight
  const n = r ? r.risersPerFlight[0] : 0;
  const sx = r ? 300 / Math.max(1, (n - 1) * r.treadCm + 40) : 1;
  const sy = r ? 160 / Math.max(1, n * r.riserCm) : 1;
  const k = Math.min(sx, sy);
  let d = '';
  if (r) {
    let x = 10, y = 180;
    d = `M${x} ${y}`;
    for (let i = 0; i < n; i++) {
      y -= r.riserCm * k;
      d += ` L${x} ${y}`;
      if (i < n - 1) {
        x += r.treadCm * k;
        d += ` L${x} ${y}`;
      }
    }
    d += ` L${x + 40 * k} ${y}`;
  }
  return (
    <div className="grid g2">
      <section className="card stack">
        <div className="grid g2" style={{ gap: 10 }}>
          <NumField label="الارتفاع من بلاط لبلاط" unit="cm" value={H} onChange={setH} min={1} />
          <NumField label="أقصى ارتفاع للقائمة" unit="cm" value={maxR} onChange={setMaxR} min={10} max={25} hint="سكني ≈ 17–18، عام ≈ 15–16" />
          <NumField label="هدف بلوندل 2R+T" unit="cm" value={blondel} onChange={setBlondel} min={55} max={70} />
          <NumField label="أقصى قوائم في القلبة" value={perFlight} onChange={setPerFlight} min={3} max={25} />
          <NumField label="عرض الدرج الصافي" unit="cm" value={width} onChange={setWidth} min={50} />
        </div>
        {err && <Note kind="danger">{err}</Note>}
        {r && r.warnings.map((w) => <Note key={w} kind="warn">{w}</Note>)}
        {r && r.warnings.length === 0 && <Note kind="sage" icon="check">الأبعاد ضمن المجالات الإرشادية الشائعة.</Note>}
      </section>
      {r && (
        <section className="card stack">
          <div className="result hero">
            <Stat k="عدد القوائم" v={<span className="num">{r.risers}</span>} />
            <Stat k="ارتفاع القائمة R" v={<span className="num">{fmt(r.riserCm, 2)}</span>} unit="cm" />
            <Stat k="عرض النائمة T" v={<span className="num">{fmt(r.treadCm, 1)}</span>} unit="cm" />
            <Stat k="2R + T" v={<span className="num">{fmt(r.blondelCm, 1)}</span>} unit="cm" />
          </div>
          <div className="result">
            <Stat k="القلبات" v={<span className="num">{r.flights}</span>} />
            <Stat k="قوائم كل قلبة" v={<span className="num">{r.risersPerFlight.join(' + ')}</span>} />
            <Stat k="البسطات الوسطية" v={<span className="num">{r.landings}</span>} />
            <Stat k="زاوية الميل" v={<span className="num">{fmt(r.pitchDeg, 1)}°</span>} />
            <Stat k="طول النائمات" v={<span className="num">{fmt(r.totalRunCm / 100, 2)}</span>} unit="m" />
            <Stat k="مع البسطات (درج مستقيم)" v={<span className="num">{fmt(r.totalRunWithLandingsCm / 100, 2)}</span>} unit="m" />
          </div>
          <svg viewBox="0 0 330 200" className="diagram" style={{ background: 'var(--ivory)', borderRadius: 10 }} aria-label="مقطع القلبة الأولى">
            <path d={d} fill="none" stroke="#2e2b27" strokeWidth="1.6" />
            <line x1="0" y1="180" x2="330" y2="180" stroke="#9a9286" strokeDasharray="3 3" />
            <text x="320" y="196" fontSize="10" textAnchor="end" fill="#6e675d">مقطع تخطيطي للقلبة الأولى ({n} قائمة)</text>
          </svg>
          <p className="tiny muted">عدد النائمات في كل قلبة = عدد قوائمها − 1. للدرج ذي القلبتين المتعاكستين (U) يكون الطول ≈ طول أطول قلبة + عمق البسطة (≥ عرض الدرج). الارتفاع الحر فوق الدرج ≥ 2.0–2.1 م عادةً.</p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const KIND_LABEL: Record<ConcreteElementKind, string> = { footing: 'أساس', column: 'عمود', beam: 'جائز', slab: 'بلاطة', wall: 'جدار بيتوني' };
const KIND_DIMS: Record<ConcreteElementKind, [string, string, string]> = {
  footing: ['الطول', 'العرض', 'السماكة'],
  column: ['ضلع 1', 'ضلع 2', 'الارتفاع'],
  beam: ['البحر', 'العرض', 'الارتفاع'],
  slab: ['الطول', 'العرض', 'السماكة'],
  wall: ['الطول', 'السماكة', 'الارتفاع'],
};

export function QuantityTool() {
  const [mode, setMode] = useState<'concrete' | 'masonry' | 'finishes'>('concrete');
  const [els, setEls] = useState<ConcreteElement[]>([
    { id: uid(), kind: 'footing', label: 'F1', a: 1.6, b: 1.6, c: 0.5, count: 6 },
    { id: uid(), kind: 'column', label: 'C1', a: 0.3, b: 0.5, c: 3.2, count: 6 },
    { id: uid(), kind: 'slab', label: 'S1', a: 12, b: 9, c: 0.25, count: 1 },
  ]);
  const [waste, setWaste] = useState(3);
  const [wl, setWl] = useState(12), [wh, setWh] = useState(3), [bl, setBl] = useState(0.4), [bh, setBh] = useState(0.2), [jt, setJt] = useState(0.01), [mw, setMw] = useState(5);
  const [ops, setOps] = useState<Opening[]>([{ w: 1.2, h: 1.5, count: 2 }, { w: 0.9, h: 2.1, count: 1 }]);
  const [fa, setFa] = useState(40), [tl, setTl] = useState(0.6), [tw, setTw] = useState(0.6), [tws, setTws] = useState(8), [coats, setCoats] = useState(2), [cov, setCov] = useState(10);
  const tot = concreteTotals(els, waste);
  const ms = masonry(wl, wh, ops, bl, bh, jt, mw);
  const setEl = (id: string, p: Partial<ConcreteElement>) => setEls(els.map((e) => (e.id === id ? { ...e, ...p } : e)));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'concrete', label: 'البيتون والقوالب' }, { value: 'masonry', label: 'البلوك' }, { value: 'finishes', label: 'البلاط والدهان' }]} />
      {mode === 'concrete' && (
        <section className="card stack">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>العنصر</th><th>الرمز</th><th>البعد 1 (m)</th><th>البعد 2 (m)</th><th>البعد 3 (m)</th><th>العدد</th><th>الحجم m³</th><th>القوالب m²</th><th /></tr></thead>
              <tbody>
                {els.map((e) => (
                  <tr key={e.id}>
                    <td style={{ minWidth: 120 }}>
                      <select className="select" value={e.kind} onChange={(ev) => setEl(e.id, { kind: ev.target.value as ConcreteElementKind })} aria-label="نوع العنصر">
                        {(Object.keys(KIND_LABEL) as ConcreteElementKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 80 }}><input className="input" value={e.label} onChange={(ev) => setEl(e.id, { label: ev.target.value })} aria-label="الرمز" /></td>
                    {(['a', 'b', 'c'] as const).map((k, i) => (
                      <td key={k} style={{ width: 95 }} title={KIND_DIMS[e.kind][i]}><NumInput value={e[k]} onChange={(v) => setEl(e.id, { [k]: Math.max(0, v) })} ariaLabel={KIND_DIMS[e.kind][i]} /></td>
                    ))}
                    <td style={{ width: 70 }}><NumInput integer value={e.count} onChange={(v) => setEl(e.id, { count: Math.max(0, v) })} ariaLabel="العدد" /></td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(elementVolume(e), 3)}</td>
                    <td className="num">{fmt(formworkArea(e), 2)}</td>
                    <td><button className="btn ghost icon sm" aria-label="حذف" onClick={() => setEls(els.filter((x) => x.id !== e.id))}><Icon name="close" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => setEls([...els, { id: uid(), kind: 'beam', label: `B${els.length + 1}`, a: 5, b: 0.3, c: 0.6, count: 1 }])}><Icon name="plus" />عنصر</button>
            <div style={{ width: 160 }}><NumField label="نسبة الهدر" unit="%" value={waste} onChange={setWaste} min={0} max={50} /></div>
          </div>
          <div className="result hero">
            {Object.entries(tot.byKind).map(([k, v]) => <Stat key={k} k={KIND_LABEL[k as ConcreteElementKind]} v={<span className="num">{fmt(v, 2)}</span>} unit="m³" />)}
            <Stat k="الصافي" v={<span className="num">{fmt(tot.net, 2)}</span>} unit="m³" />
            <Stat k={`مع الهدر ${waste}%`} v={<span className="num">{fmt(tot.withWaste, 2)}</span>} unit="m³" />
            <Stat k="القوالب" v={<span className="num">{fmt(els.reduce((s, e) => s + formworkArea(e), 0), 1)}</span>} unit="m²" />
          </div>
          <p className="tiny muted">القوالب تقريبية: الأساس والعمود = المحيط × الارتفاع، الجائز = (2×الارتفاع + العرض) × البحر، البلاطة = السطح السفلي. لا يُطرح التقاطع بين العناصر — اتبعي قواعد القياس في مقرركم (مثلاً حساب الأعمدة بين البلاطات).</p>
        </section>
      )}
      {mode === 'masonry' && (
        <div className="grid g2">
          <section className="card stack">
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label="طول الجدار" unit="m" value={wl} onChange={setWl} min={0} />
              <NumField label="ارتفاع الجدار" unit="m" value={wh} onChange={setWh} min={0} />
              <NumField label="طول البلوكة" unit="m" value={bl} onChange={setBl} min={0.01} />
              <NumField label="ارتفاع البلوكة" unit="m" value={bh} onChange={setBh} min={0.01} />
              <NumField label="سماكة المونة" unit="m" value={jt} onChange={setJt} min={0} />
              <NumField label="الهدر" unit="%" value={mw} onChange={setMw} min={0} max={50} />
            </div>
            <div className="label">الفتحات (تُخصم)</div>
            {ops.map((o, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <div style={{ width: 90 }}><NumInput value={o.w} ariaLabel="عرض الفتحة" onChange={(v) => setOps(ops.map((x, j) => (j === i ? { ...x, w: v } : x)))} /></div>×
                <div style={{ width: 90 }}><NumInput value={o.h} ariaLabel="ارتفاع الفتحة" onChange={(v) => setOps(ops.map((x, j) => (j === i ? { ...x, h: v } : x)))} /></div>م ×
                <div style={{ width: 70 }}><NumInput integer value={o.count} ariaLabel="العدد" onChange={(v) => setOps(ops.map((x, j) => (j === i ? { ...x, count: v } : x)))} /></div>
                <button className="btn ghost icon sm" aria-label="حذف" onClick={() => setOps(ops.filter((_, j) => j !== i))}><Icon name="close" /></button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOps([...ops, { w: 1, h: 1, count: 1 }])}><Icon name="plus" />فتحة</button>
          </section>
          <section className="card stack">
            <div className="result hero">
              <Stat k="المساحة الإجمالية" v={<span className="num">{fmt(ms.grossArea, 2)}</span>} unit="m²" />
              <Stat k="الفتحات" v={<span className="num">{fmt(ms.openings, 2)}</span>} unit="m²" />
              <Stat k="المساحة الصافية" v={<span className="num">{fmt(ms.netArea, 2)}</span>} unit="m²" />
              <Stat k="بلوكة / م²" v={<span className="num">{fmt(ms.perM2, 2)}</span>} />
              <Stat k="عدد البلوك مع الهدر" v={<span className="num">{ms.blocks}</span>} />
            </div>
            <p className="tiny muted">عدد البلوك/م² = 1 ÷ [(طول البلوكة + المونة) × (ارتفاعها + المونة)]. مساحة اللياسة لوجه واحد = المساحة الصافية ({fmt(ms.netArea, 2)} م²)، ولوجهين ضعفها.</p>
          </section>
        </div>
      )}
      {mode === 'finishes' && (
        <div className="grid g2">
          <section className="card stack">
            <h3>البلاط</h3>
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label="المساحة" unit="m²" value={fa} onChange={setFa} min={0} />
              <NumField label="الهدر" unit="%" value={tws} onChange={setTws} min={0} max={50} />
              <NumField label="طول البلاطة" unit="m" value={tl} onChange={setTl} min={0.01} />
              <NumField label="عرض البلاطة" unit="m" value={tw} onChange={setTw} min={0.01} />
            </div>
            <div className="result hero"><Stat k="بلاطة / م²" v={<span className="num">{fmt(tiles(fa, tl, tw, tws).perM2, 2)}</span>} /><Stat k="العدد الكلي" v={<span className="num">{tiles(fa, tl, tw, tws).count}</span>} /></div>
          </section>
          <section className="card stack">
            <h3>الدهان</h3>
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label="المساحة" unit="m²" value={fa} onChange={setFa} min={0} />
              <NumField label="عدد الطبقات" value={coats} onChange={setCoats} min={1} />
              <NumField label="التغطية" unit="m²/L" value={cov} onChange={setCov} min={0.1} hint="من بيانات المُصنّع" />
            </div>
            <div className="result hero"><Stat k="الكمية" v={<span className="num">{fmt(paint(fa, coats, cov).litres, 1)}</span>} unit="L" /></div>
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const BEAM_CASES: { value: BeamCase; label: string }[] = [
  { value: 'simply-udl', label: 'بسيط الاستناد — حمل موزع' },
  { value: 'simply-point-mid', label: 'بسيط الاستناد — حمل مركز في المنتصف' },
  { value: 'cantilever-udl', label: 'ظفر — حمل موزع' },
  { value: 'cantilever-point-end', label: 'ظفر — حمل مركز في الطرف' },
];

export function ConcreteTool() {
  const [mode, setMode] = useState<'actions' | 'capacity' | 'design' | 'mix'>('capacity');
  const [bc, setBc] = useState<BeamCase>('simply-udl');
  const [L, setL] = useState(6), [D, setD] = useState(15), [LL, setLL] = useState(8);
  const [b, setB] = useState(300), [d, setDd] = useState(500), [fc, setFc] = useState(25), [fy, setFy] = useState(420), [nb, setNb] = useState(3), [dia, setDia] = useState(20);
  const [Mu, setMu] = useState(150);
  const [vol, setVol] = useState(1), [mixMode, setMixMode] = useState<'ratio' | 'dosage'>('dosage'), [rc, setRc] = useState(1), [rs, setRs] = useState(2), [rg, setRg] = useState(4), [dos, setDos] = useState(350), [sand, setSand] = useState(0.4), [grav, setGrav] = useState(0.8), [wc, setWc] = useState(0.5);

  const wu = factoredLoad(D, LL);
  const act = beamActions(bc, L, wu.governing);
  const As = barsArea(nb, dia);
  let cap: ReturnType<typeof singlyReinforcedCapacity> | null = null;
  let capErr = '';
  try { cap = singlyReinforcedCapacity({ b, d, As, fc, fy }); } catch (e) { capErr = (e as Error).message; }
  const req = requiredSteel(Mu, b, d, fc, fy);
  const mix = mixMode === 'ratio' ? mixByRatio(vol, rc, rs, rg, wc) : mixByDosage(vol, dos, sand, grav, wc);
  const isPoint = bc.includes('point');

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Note kind="warn">أداة تدريب تعليمية. لا تعتبر تصميماً إنشائياً ولا تحققاً من الأمان. الحسابات تتبع ACI 318-19؛ إن كان مقرركم يعتمد الكود العربي السوري أو معاملات أخرى فاتبعيها.</Note>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'actions', label: 'عزوم الجوائز' }, { value: 'capacity', label: 'مقاومة مقطع' }, { value: 'design', label: 'التسليح المطلوب' }, { value: 'mix', label: 'كميات الخلطة' }]} />

      {mode === 'actions' && (
        <div className="grid g2">
          <section className="card stack">
            <Select label="الحالة" value={bc} onChange={setBc} options={BEAM_CASES} />
            <NumField label="البحر L" unit="m" value={L} onChange={setL} min={0} />
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label={isPoint ? 'الحمل الميت P_D' : 'الحمل الميت w_D'} unit={isPoint ? 'kN' : 'kN/m'} value={D} onChange={setD} min={0} />
              <NumField label={isPoint ? 'الحمل الحي P_L' : 'الحمل الحي w_L'} unit={isPoint ? 'kN' : 'kN/m'} value={LL} onChange={setLL} min={0} />
            </div>
          </section>
          <section className="card stack">
            <h3>الحل خطوة بخطوة</h3>
            <ol className="small" style={{ paddingInlineStart: 20, lineHeight: 2.1, margin: 0 }}>
              <li>التركيب 1: 1.4D = 1.4 × {fmt(D)} = <span className="num">{fmt(wu.c1, 2)}</span></li>
              <li>التركيب 2: 1.2D + 1.6L = 1.2 × {fmt(D)} + 1.6 × {fmt(LL)} = <span className="num">{fmt(wu.c2, 2)}</span></li>
              <li>الحمل التصميمي = الأكبر = <strong className="num">{fmt(wu.governing, 2)} {isPoint ? 'kN' : 'kN/m'}</strong></li>
              <li>Mu = {act.formulaM} = <strong className="num">{fmt(act.M, 2)} kN·m</strong></li>
              <li>Vu = {act.formulaV} = <strong className="num">{fmt(act.V, 2)} kN</strong> (عند المسند، قبل التخفيض عند مسافة d)</li>
            </ol>
            <div className="result hero"><Stat k="Mu" v={<span className="num">{fmt(act.M, 2)}</span>} unit="kN·m" /><Stat k="Vu" v={<span className="num">{fmt(act.V, 2)}</span>} unit="kN" /></div>
            <p className="tiny muted">الوزن الذاتي للجائز يُضاف إلى الحمل الميت (≈ 25 kN/m³ × b × h). معاملات التحميل حسب ACI 318-19 الجدول 5.3.1.</p>
          </section>
        </div>
      )}

      {mode === 'capacity' && (
        <div className="grid g2">
          <section className="card stack">
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label="العرض b" unit="mm" value={b} onChange={setB} min={1} />
              <NumField label="الارتفاع الفعال d" unit="mm" value={d} onChange={setDd} min={1} />
              <NumField label="f'c" unit="MPa" value={fc} onChange={setFc} min={1} />
              <NumField label="fy" unit="MPa" value={fy} onChange={setFy} min={1} />
              <NumField label="عدد القضبان" value={nb} onChange={setNb} min={1} />
              <NumField label="القطر Ø" unit="mm" value={dia} onChange={setDia} min={1} />
            </div>
            <div className="result"><Stat k="As" v={<span className="num">{fmt(As, 1)}</span>} unit="mm²" /></div>
          </section>
          <section className="card stack">
            {capErr && <Note kind="danger">{capErr}</Note>}
            {cap && (
              <>
                <ol className="small" style={{ paddingInlineStart: 20, lineHeight: 2.1, margin: 0 }}>
                  <li>a = As·fy / (0.85·f'c·b) = {fmt(As, 1)}×{fy} / (0.85×{fc}×{b}) = <span className="num">{fmt(cap.a, 2)} mm</span></li>
                  <li>β₁ = {fmt(cap.beta1, 3)} ⇒ c = a/β₁ = <span className="num">{fmt(cap.c, 2)} mm</span></li>
                  <li>εt = 0.003(d − c)/c = <span className="num">{fmt(cap.epsT, 5)}</span> (εty = {fmt(cap.epsTy, 5)})</li>
                  <li>التصنيف: {cap.classification === 'tension-controlled' ? 'مقطع محكوم بالشد' : cap.classification === 'transition' ? 'منطقة انتقالية' : 'محكوم بالضغط'} ⇒ φ = <span className="num">{fmt(cap.phi, 3)}</span></li>
                  <li>Mn = As·fy·(d − a/2) = <span className="num">{fmt(cap.Mn, 2)} kN·m</span></li>
                  <li>As,min = max(0.25√f'c/fy, 1.4/fy)·b·d = <span className="num">{fmt(cap.AsMin, 1)} mm²</span> {cap.meetsAsMin ? '✓' : '✗'}</li>
                </ol>
                <div className="result hero"><Stat k="φMn" v={<span className="num">{fmt(cap.phiMn, 2)}</span>} unit="kN·m" /><Stat k="ρ" v={<span className="num">{fmt(cap.rho * 100, 3)}%</span>} /></div>
                {cap.notes.map((n) => <Note key={n} kind="warn">{n}</Note>)}
              </>
            )}
          </section>
        </div>
      )}

      {mode === 'design' && (
        <div className="grid g2">
          <section className="card stack">
            <NumField label="العزم التصميمي Mu" unit="kN·m" value={Mu} onChange={setMu} min={0} />
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label="b" unit="mm" value={b} onChange={setB} min={1} />
              <NumField label="d" unit="mm" value={d} onChange={setDd} min={1} />
              <NumField label="f'c" unit="MPa" value={fc} onChange={setFc} min={1} />
              <NumField label="fy" unit="MPa" value={fy} onChange={setFy} min={1} />
            </div>
          </section>
          <section className="card stack">
            {!req.ok ? <Note kind="danger">{req.message}</Note> : (
              <>
                <ol className="small" style={{ paddingInlineStart: 20, lineHeight: 2.1, margin: 0 }}>
                  <li>نفترض φ = 0.9 (مقطع محكوم بالشد)</li>
                  <li>Rn = Mu / (φ·b·d²) = <span className="num">{fmt(req.Rn, 3)} MPa</span></li>
                  <li>ρ = (0.85f'c/fy)·[1 − √(1 − 2Rn/(0.85f'c))] = <span className="num">{fmt(req.rho * 100, 4)}%</span></li>
                  <li>As = max(ρ·b·d, As,min) = <span className="num">{fmt(req.As, 1)} mm²</span>{req.governedByMin ? ' (يحكمه الحد الأدنى)' : ''}</li>
                </ol>
                <div className="result hero"><Stat k="As المطلوب" v={<span className="num">{fmt(req.As, 0)}</span>} unit="mm²" /></div>
                <div className="table-wrap">
                  <table className="t">
                    <thead><tr><th>Ø</th><th>عدد القضبان</th><th>As المحقق</th></tr></thead>
                    <tbody>
                      {[12, 14, 16, 18, 20, 25].map((ø) => {
                        const n = Math.max(2, Math.ceil(req.As / barsArea(1, ø)));
                        return <tr key={ø}><td className="num">Ø{ø}</td><td className="num">{n}</td><td className="num">{fmt(barsArea(n, ø), 0)} mm²</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="tiny muted">تحققي بعدها من اتساع العرض للقضبان (التباعد الأدنى والتغطية) ومن εt عبر «مقاومة مقطع».</p>
              </>
            )}
          </section>
        </div>
      )}

      {mode === 'mix' && (
        <div className="grid g2">
          <section className="card stack">
            <NumField label="حجم البيتون المطلوب" unit="m³" value={vol} onChange={setVol} min={0} />
            <Segmented value={mixMode} onChange={setMixMode} options={[{ value: 'dosage', label: 'حسب العيار (كغ/م³)' }, { value: 'ratio', label: 'نسبة حجمية 1:2:4' }]} />
            {mixMode === 'dosage' ? (
              <div className="grid g3" style={{ gap: 10 }}>
                <NumField label="عيار الإسمنت" unit="kg/m³" value={dos} onChange={setDos} min={0} />
                <NumField label="رمل لكل م³" unit="m³" value={sand} onChange={setSand} min={0} />
                <NumField label="بحص لكل م³" unit="m³" value={grav} onChange={setGrav} min={0} />
              </div>
            ) : (
              <div className="grid g3" style={{ gap: 10 }}>
                <NumField label="إسمنت" value={rc} onChange={setRc} min={0} />
                <NumField label="رمل" value={rs} onChange={setRs} min={0} />
                <NumField label="بحص" value={rg} onChange={setRg} min={0} />
              </div>
            )}
            <NumField label="نسبة الماء/الإسمنت" value={wc} onChange={setWc} min={0.2} max={1} />
          </section>
          <section className="card stack">
            <div className="result hero">
              <Stat k="الإسمنت" v={<span className="num">{fmt(mix.cementKg, 0)}</span>} unit="kg" />
              <Stat k="أكياس 50 كغ" v={<span className="num">{fmt(Math.ceil(mix.cementBags), 0)}</span>} />
              <Stat k="الرمل" v={<span className="num">{fmt(mix.sandM3, 2)}</span>} unit="m³" />
              <Stat k="البحص" v={<span className="num">{fmt(mix.gravelM3, 2)}</span>} unit="m³" />
              <Stat k="الماء" v={<span className="num">{fmt(mix.waterL, 0)}</span>} unit="L" />
            </div>
            <p className="tiny muted">
              {mixMode === 'ratio'
                ? 'الطريقة الحجمية: الحجم الجاف = 1.54 × الحجم الرطب، كثافة الإسمنت الظاهرية 1440 كغ/م³ (قيم كتب شائعة). الخلطات الحجمية الاسمية للتمرين فقط.'
                : 'القيم الافتراضية (350 كغ، 0.4 م³ رمل، 0.8 م³ بحص) قيم عرفية شائعة في الممارسة المحلية وليست تصميم خلطة — عدّليها حسب مقرركم أو المواصفة.'}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function MaterialsTool() {
  const [layers, setLayers] = useState<Layer[]>([
    { id: uid(), materialId: 'cement-plaster', thicknessMm: 20 },
    { id: uid(), materialId: 'block-hollow', thicknessMm: 200 },
    { id: uid(), materialId: 'gypsum-plaster', thicknessMm: 15 },
  ]);
  const [sort, setSort] = useState<'lambda' | 'density'>('lambda');
  const u = uValue(layers);
  const withIns = uValue([...layers, { id: 'x', materialId: 'eps', thicknessMm: 50 }]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card stack">
        <div className="card-head"><h3>معامل انتقال الحرارة لجدار — U-value</h3></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>الطبقة (من الخارج للداخل)</th><th>السماكة mm</th><th>λ W/mK</th><th>R m²K/W</th><th /></tr></thead>
            <tbody>
              <tr><td className="muted">مقاومة السطح الخارجي Rse</td><td /><td /><td className="num">{RSE_WALL}</td><td /></tr>
              {layers.map((l) => {
                const m = MATERIALS.find((x) => x.id === l.materialId);
                return (
                  <tr key={l.id}>
                    <td style={{ minWidth: 200 }}>
                      <select className="select" value={l.materialId} onChange={(e) => setLayers(layers.map((x) => (x.id === l.id ? { ...x, materialId: e.target.value } : x)))} aria-label="المادة">
                        {MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.ar}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 100 }}><NumInput value={l.thicknessMm} ariaLabel="السماكة" onChange={(v) => setLayers(layers.map((x) => (x.id === l.id ? { ...x, thicknessMm: Math.max(0, v) } : x)))} /></td>
                    <td className="num">{m?.lambda}</td>
                    <td className="num">{fmt(u.parts.find((p) => p.id === l.id)?.R ?? 0, 3)}</td>
                    <td><button className="btn ghost icon sm" aria-label="حذف" onClick={() => setLayers(layers.filter((x) => x.id !== l.id))}><Icon name="close" /></button></td>
                  </tr>
                );
              })}
              <tr><td className="muted">مقاومة السطح الداخلي Rsi</td><td /><td /><td className="num">{RSI_WALL}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setLayers([...layers, { id: uid(), materialId: 'eps', thicknessMm: 50 }])}><Icon name="plus" />طبقة</button>
        <div className="result hero">
          <Stat k="R الكلي" v={<span className="num">{fmt(u.R, 3)}</span>} unit="m²K/W" />
          <Stat k="U" v={<span className="num">{fmt(u.U, 3)}</span>} unit="W/m²K" />
          <Stat k="السماكة" v={<span className="num">{fmt(u.thicknessMm, 0)}</span>} unit="mm" />
          <Stat k="الكتلة" v={<span className="num">{fmt(u.massPerM2, 0)}</span>} unit="kg/m²" />
        </div>
        <p className="small muted">للمقارنة: إضافة 5 سم بوليسترين ممدد لهذا الجدار تعطي U = <span className="num">{fmt(withIns.U, 3)}</span> W/m²K. الحساب لا يشمل الجسور الحرارية (الأعمدة والجوائز) التي ترفع U الفعلية.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>خصائص المواد النموذجية</h3>
          <Segmented value={sort} onChange={setSort} options={[{ value: 'lambda', label: 'حسب العزل' }, { value: 'density', label: 'حسب الكثافة' }]} />
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>المادة</th><th>English</th><th>الكثافة kg/m³</th><th>λ نموذجية</th><th>المجال</th><th>ملاحظات</th></tr></thead>
            <tbody>
              {[...MATERIALS].sort((a, b) => (sort === 'lambda' ? a.lambda - b.lambda : a.density - b.density)).map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.ar}</td>
                  <td className="en">{m.en}</td>
                  <td className="num">{m.density}</td>
                  <td className="num">{m.lambda}</td>
                  <td className="num tiny">{m.lambdaRange}</td>
                  <td className="tiny muted">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>قيم تصميمية نموذجية (ISO 10456 / CIBSE Guide A). المنتجات الحقيقية تختلف — استعملي قيمة المُصنّع عند توفرها.</p>
      </section>
    </div>
  );
}
