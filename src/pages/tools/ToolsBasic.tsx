import { useState } from 'react';
import { NumField, Note, Segmented, Select, Stat, NumInput } from '../../components/ui';
import { Icon } from '../../components/Icon';
import {
  PAPER_SIZES, STANDARD_SCALES, areas, fitScale, heron, hypotenuse, paperToReal, polygonArea, polygonPerimeter, rampRun, realToPaper, rescale,
  slopeFromDegrees, slopeFromPercent, slopeFromRatio, type Pt,
} from '../../lib/calc/geometry';
import { UNIT_CATEGORIES, convert } from '../../lib/calc/units';
import { fmt } from '../../lib/format';

const scaleOpts = STANDARD_SCALES.filter((s) => s > 1).map((s) => ({ value: String(s), label: `1:${s}` }));

// ---------------------------------------------------------------------------
export function ScaleTool() {
  const [den, setDen] = useState('100');
  const [real, setReal] = useState(6);
  const [paper, setPaper] = useState(45);
  const [from, setFrom] = useState('100');
  const [to, setTo] = useState('50');
  const [measured, setMeasured] = useState(30);
  const [L, setL] = useState(42);
  const [W, setW] = useState(24);
  const [sheet, setSheet] = useState('A1');
  const [margin, setMargin] = useState(20);
  const ps = PAPER_SIZES.find((p) => p.name === sheet)!;
  const fit = fitScale(L, W, ps, margin);
  return (
    <div className="grid g2">
      <section className="card stack">
        <h3>حقيقي ⇄ على اللوحة</h3>
        <Select label="المقياس" value={den} onChange={setDen} options={scaleOpts} />
        <NumField label="الطول الحقيقي" unit="m" value={real} onChange={setReal} min={0} />
        <div className="result hero"><Stat k={`على اللوحة بمقياس 1:${den}`} v={<span className="num">{fmt(realToPaper(real, Number(den)), 2)}</span>} unit="mm" /></div>
        <NumField label="طول مقاس على اللوحة" unit="mm" value={paper} onChange={setPaper} min={0} />
        <div className="result"><Stat k="الطول الحقيقي" v={<span className="num">{fmt(paperToReal(paper, Number(den)), 3)}</span>} unit="m" /></div>
      </section>
      <section className="card stack">
        <h3>تغيير المقياس</h3>
        <div className="grid g2" style={{ gap: 10 }}>
          <Select label="من" value={from} onChange={setFrom} options={scaleOpts} />
          <Select label="إلى" value={to} onChange={setTo} options={scaleOpts} />
        </div>
        <NumField label="قياس على اللوحة الأصلية" unit="mm" value={measured} onChange={setMeasured} min={0} />
        <div className="result"><Stat k="القياس بعد التحويل" v={<span className="num">{fmt(rescale(measured, Number(from), Number(to)), 2)}</span>} unit="mm" /><Stat k="نسبة التكبير" v={<span className="num">{fmt(Number(from) / Number(to), 3)}×</span>} /></div>
        <hr className="divider" />
        <h3>أي مقياس يناسب الورقة؟</h3>
        <div className="grid g2" style={{ gap: 10 }}>
          <NumField label="طول المبنى/الموقع" unit="m" value={L} onChange={setL} min={0} />
          <NumField label="عرضه" unit="m" value={W} onChange={setW} min={0} />
          <Select label="الورق" value={sheet} onChange={setSheet} options={PAPER_SIZES.map((p) => ({ value: p.name, label: `${p.name} (${p.w}×${p.h} mm)` }))} />
          <NumField label="الهامش من كل جانب" unit="mm" value={margin} onChange={setMargin} min={0} />
        </div>
        <div className="result hero"><Stat k="أكبر مقياس قياسي يتسع" v={<span className="num">{fit ? `1:${fit}` : '—'}</span>} /></div>
        {!fit && <Note kind="warn">لا يتسع بأي مقياس قياسي حتى 1:10000 — تحققي من القيم.</Note>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AreaTool() {
  const [mode, setMode] = useState<'poly' | 'shapes' | 'tri'>('poly');
  const [pts, setPts] = useState<Pt[]>([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 12 }, { x: 8, y: 18 }, { x: 0, y: 12 }]);
  const [a, setA] = useState(5), [b, setB] = useState(4), [c, setC] = useState(3), [r, setR] = useState(2), [ang, setAng] = useState(90);
  const area = polygonArea(pts);
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const k = 260 / span;
  const tri = heron(a, b, c);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'poly', label: 'مضلع بالإحداثيات' }, { value: 'shapes', label: 'أشكال أساسية' }, { value: 'tri', label: 'مثلث بثلاثة أضلاع' }]} />
      {mode === 'poly' && (
        <div className="grid g2">
          <section className="card stack">
            <p className="small muted" style={{ margin: 0 }}>أدخلي رؤوس المضلع بالترتيب (مع أو عكس عقارب الساعة) بالأمتار — مثلاً من المخطط المساحي.</p>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>#</th><th>X (m)</th><th>Y (m)</th><th /></tr></thead>
                <tbody>
                  {pts.map((p, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td><NumInput value={p.x} ariaLabel={`X ${i + 1}`} onChange={(v) => setPts(pts.map((q, j) => (j === i ? { ...q, x: v } : q)))} /></td>
                      <td><NumInput value={p.y} ariaLabel={`Y ${i + 1}`} onChange={(v) => setPts(pts.map((q, j) => (j === i ? { ...q, y: v } : q)))} /></td>
                      <td><button className="btn ghost icon sm" aria-label="حذف" disabled={pts.length <= 3} onClick={() => setPts(pts.filter((_, j) => j !== i))}><Icon name="close" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPts([...pts, { ...pts[pts.length - 1] }])}><Icon name="plus" />رأس</button>
          </section>
          <section className="card stack">
            <svg viewBox="-20 -20 300 300" className="diagram" style={{ maxWidth: 360, margin: '0 auto', background: 'var(--ivory)', borderRadius: 10 }} aria-label="شكل المضلع">
              <polygon points={pts.map((p) => `${(p.x - minX) * k},${260 - (p.y - minY) * k}`).join(' ')} fill="rgba(181,132,79,.18)" stroke="#2e2b27" strokeWidth="1.5" />
              {pts.map((p, i) => <text key={i} x={(p.x - minX) * k + 4} y={260 - (p.y - minY) * k - 4} fontSize="11" fill="#9a6a3c">{i + 1}</text>)}
            </svg>
            <div className="result hero">
              <Stat k="المساحة" v={<span className="num">{fmt(area, 2)}</span>} unit="m²" />
              <Stat k="المحيط" v={<span className="num">{fmt(polygonPerimeter(pts), 2)}</span>} unit="m" />
            </div>
            <p className="tiny muted">A = ½ |Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)| — صحيحة لأي مضلع بسيط (أضلاعه لا تتقاطع).</p>
          </section>
        </div>
      )}
      {mode === 'shapes' && (
        <div className="grid g2">
          <section className="card stack">
            <div className="grid g2" style={{ gap: 10 }}>
              <NumField label="a (طول / قاعدة كبرى)" unit="m" value={a} onChange={setA} min={0} />
              <NumField label="b (عرض / قاعدة صغرى)" unit="m" value={b} onChange={setB} min={0} />
              <NumField label="h (ارتفاع)" unit="m" value={c} onChange={setC} min={0} />
              <NumField label="r (نصف القطر)" unit="m" value={r} onChange={setR} min={0} />
              <NumField label="زاوية القطاع" unit="°" value={ang} onChange={setAng} min={0} max={360} />
            </div>
          </section>
          <section className="card">
            <div className="table-wrap">
              <table className="t">
                <tbody>
                  <tr><td>مستطيل a × b</td><td className="num">{fmt(areas.rectangle(a, b), 3)} m²</td></tr>
                  <tr><td>مثلث ½ a × h</td><td className="num">{fmt(areas.triangle(a, c), 3)} m²</td></tr>
                  <tr><td>شبه منحرف ½(a+b) × h</td><td className="num">{fmt(areas.trapezoid(a, b, c), 3)} m²</td></tr>
                  <tr><td>دائرة π r²</td><td className="num">{fmt(areas.circle(r), 3)} m²</td></tr>
                  <tr><td>قطاع دائري π r² θ/360</td><td className="num">{fmt(areas.sector(r, ang), 3)} m²</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {mode === 'tri' && (
        <section className="card stack" style={{ maxWidth: 560 }}>
          <div className="grid g3" style={{ gap: 10 }}>
            <NumField label="الضلع a" unit="m" value={a} onChange={setA} min={0} />
            <NumField label="الضلع b" unit="m" value={b} onChange={setB} min={0} />
            <NumField label="الضلع c" unit="m" value={c} onChange={setC} min={0} />
          </div>
          {isNaN(tri) ? <Note kind="warn">هذه الأطوال لا تشكل مثلثاً (مجموع أي ضلعين يجب أن يكون أكبر من الثالث).</Note> : (
            <div className="result hero"><Stat k="المساحة (هيرون)" v={<span className="num">{fmt(tri, 3)}</span>} unit="m²" /></div>
          )}
          <p className="tiny muted">مفيدة لتقسيم موقع غير منتظم إلى مثلثات مقاسة بالشريط في الموقع.</p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function UnitsTool() {
  const [cat, setCat] = useState('stress');
  const c = UNIT_CATEGORIES.find((x) => x.id === cat)!;
  const [from, setFrom] = useState('MPa');
  const [val, setVal] = useState(1);
  const fromId = c.units.some((u) => u.id === from) ? from : c.units[0].id;
  return (
    <div className="grid split">
      <section className="card stack">
        <div className="grid g3" style={{ gap: 10 }}>
          <Select label="الكمية" value={cat} onChange={(v) => { setCat(v); setFrom(UNIT_CATEGORIES.find((x) => x.id === v)!.units[0].id); }} options={UNIT_CATEGORIES.map((x) => ({ value: x.id, label: x.label }))} />
          <Select label="من الواحدة" value={fromId} onChange={setFrom} options={c.units.map((u) => ({ value: u.id, label: u.label }))} />
          <NumField label="القيمة" value={val} onChange={setVal} />
        </div>
        <div className="table-wrap">
          <table className="t">
            <tbody>
              {c.units.map((u) => (
                <tr key={u.id} style={{ background: u.id === fromId ? 'var(--bronze-soft)' : undefined }}>
                  <td>{u.label}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmt(convert(val, cat, fromId, u.id), 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="card small">
        <h3 style={{ marginBottom: 8 }}>تذكير سريع</h3>
        <ul style={{ paddingInlineStart: 18, margin: 0, lineHeight: 2 }}>
          <li>1 MPa = 1 N/mm² ≈ 10.2 kg/cm²</li>
          <li>1 kN/m² = 1 kPa ≈ 0.102 t/m²</li>
          <li>1 t (ثقلي) ≈ 9.81 kN</li>
          <li>الوزن الحجمي للبيتون المسلح ≈ 25 kN/m³</li>
          <li>1 دونم = 1000 م²</li>
        </ul>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function MeasureTool() {
  const [mode, setMode] = useState<'pct' | 'deg' | 'ratio'>('pct');
  const [v, setV] = useState(8.33);
  const s = mode === 'pct' ? slopeFromPercent(v) : mode === 'deg' ? slopeFromDegrees(v) : slopeFromRatio(v);
  const [rise, setRise] = useState(0.45);
  const [n, setN] = useState(12);
  const [ta, setTa] = useState(3), [tb, setTb] = useState(4);
  const [chord, setChord] = useState(6), [sag, setSag] = useState(1);
  const R = (chord * chord) / (8 * sag) + sag / 2;
  const theta = 2 * Math.asin(Math.min(1, chord / (2 * R)));
  return (
    <div className="grid g2">
      <section className="card stack">
        <h3>الميل — Slope</h3>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'pct', label: 'نسبة %' }, { value: 'deg', label: 'درجات' }, { value: 'ratio', label: '1 : n' }]} />
        <NumField label={mode === 'pct' ? 'الميل %' : mode === 'deg' ? 'الزاوية °' : 'n في 1:n'} value={v} onChange={setV} min={0} />
        <div className="result hero">
          <Stat k="نسبة مئوية" v={<span className="num">{fmt(s.percent, 2)}%</span>} />
          <Stat k="زاوية" v={<span className="num">{fmt(s.degrees, 2)}°</span>} />
          <Stat k="نسبة" v={<span className="num">1:{fmt(s.ratio, 2)}</span>} />
        </div>
        <hr className="divider" />
        <h3>طول المنحدر — Ramp</h3>
        <div className="grid g2" style={{ gap: 10 }}>
          <NumField label="فرق المنسوب" unit="m" value={rise} onChange={setRise} min={0} />
          <NumField label="الميل 1:n" value={n} onChange={setN} min={1} />
        </div>
        <div className="result"><Stat k="الطول الأفقي" v={<span className="num">{fmt(rampRun(rise, n), 2)}</span>} unit="m" /><Stat k="الطول المائل" v={<span className="num">{fmt(hypotenuse(rise, rampRun(rise, n)), 2)}</span>} unit="m" /></div>
        <p className="tiny muted">1:12 (8.33%) هو الحد الأقصى الشائع لمنحدرات الكراسي المتحركة (ADA)، مع بسطة استراحة كل 9 م تقريباً وفرق منسوب لا يتجاوز 0.76 م للقلبة الواحدة. تحققي من الكود المحلي.</p>
      </section>
      <section className="stack" style={{ gap: 18 }}>
        <div className="card stack">
          <h3>المثلث القائم</h3>
          <div className="grid g2" style={{ gap: 10 }}>
            <NumField label="الضلع a" unit="m" value={ta} onChange={setTa} min={0} />
            <NumField label="الضلع b" unit="m" value={tb} onChange={setTb} min={0} />
          </div>
          <div className="result"><Stat k="الوتر" v={<span className="num">{fmt(hypotenuse(ta, tb), 3)}</span>} unit="m" /><Stat k="الزاوية مقابل a" v={<span className="num">{fmt((Math.atan2(ta, tb) * 180) / Math.PI, 2)}°</span>} /></div>
          <p className="tiny muted">للتحقق من تعامد زوايا الموقع: 3-4-5 م.</p>
        </div>
        <div className="card stack">
          <h3>قوس من الوتر والسهم</h3>
          <div className="grid g2" style={{ gap: 10 }}>
            <NumField label="الوتر (Chord)" unit="m" value={chord} onChange={setChord} min={0} />
            <NumField label="السهم (Rise)" unit="m" value={sag} onChange={setSag} min={0.001} />
          </div>
          <div className="result"><Stat k="نصف القطر" v={<span className="num">{fmt(R, 3)}</span>} unit="m" /><Stat k="طول القوس" v={<span className="num">{fmt(R * theta, 3)}</span>} unit="m" /></div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>أحجام الورق ISO 216</h3>
          <div className="table-wrap"><table className="t"><tbody>{PAPER_SIZES.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num">{p.w} × {p.h} mm</td></tr>)}</tbody></table></div>
        </div>
      </section>
    </div>
  );
}
