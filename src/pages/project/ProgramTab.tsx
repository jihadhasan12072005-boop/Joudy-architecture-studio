import type { TabProps } from './ProjectWorkspace';
import type { AdjacencyValue, ProgramData, SpaceRow } from '../../db/types';
import { Checklist, Empty, Note, NumField, Stat } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { BubbleDiagram } from '../../components/BubbleDiagram';
import { adjacencyKey, rowArea, summarizeProgram } from '../../lib/program';
import { fmt } from '../../lib/format';
import { uid } from '../../lib/id';
import { PROGRAM_CHECKS } from '../../data/checklists';
import { NumInput } from '../../components/ui';

const ADJ_NEXT: Record<string, AdjacencyValue> = { '0': 2, '2': 1, '1': -1, '-1': 0 };
const ADJ_SYMBOL: Record<string, string> = { '2': '●', '1': '○', '0': '', '-1': '✕' };

export function ProgramTab({ project: p, update }: TabProps) {
  const pr = p.program;
  const zones = p.concept.zones;
  const setPr = (patch: Partial<ProgramData>) => update((x) => ({ ...x, program: { ...x.program, ...patch } }));
  const setRow = (id: string, patch: Partial<SpaceRow>) => setPr({ spaces: pr.spaces.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const sum = summarizeProgram(p);
  const addRow = () =>
    setPr({ spaces: [...pr.spaces, { id: uid(), name: '', zoneId: zones[0]?.id ?? '', floor: 0, quantity: 1, unitArea: 0, occupants: 0, notes: '' }] });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card">
        <div className="card-head">
          <h3>جدول الفراغات — Space schedule</h3>
          <button className="btn primary sm" onClick={addRow}><Icon name="plus" />فراغ</button>
        </div>
        {pr.spaces.length === 0 ? (
          <Empty icon="list" title="الجدول فارغ">أضيفي الفراغات من برنامج الأستاذ. المساحة = العدد × مساحة الوحدة (صافية، بدون حركة وجدران).</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>الفراغ</th><th>النطاق</th><th>الطابق</th><th>العدد</th><th>مساحة الوحدة م²</th><th>الإجمالي م²</th><th>المستخدمون/وحدة</th><th>ملاحظات</th><th />
                </tr>
              </thead>
              <tbody>
                {pr.spaces.map((r) => (
                  <tr key={r.id}>
                    <td style={{ minWidth: 150 }}><input className="input" value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} aria-label="اسم الفراغ" placeholder="مثال: قاعة مطالعة" /></td>
                    <td style={{ minWidth: 130 }}>
                      <select className="select" value={r.zoneId} onChange={(e) => setRow(r.id, { zoneId: e.target.value })} aria-label="النطاق" style={{ borderInlineStart: `5px solid ${zones.find((z) => z.id === r.zoneId)?.color ?? 'transparent'}` }}>
                        <option value="">—</option>
                        {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 80 }}><NumInput integer value={r.floor} onChange={(v) => setRow(r.id, { floor: v })} ariaLabel="الطابق" /></td>
                    <td style={{ width: 70 }}><NumInput integer value={r.quantity} onChange={(v) => setRow(r.id, { quantity: Math.max(0, v) })} ariaLabel="العدد" /></td>
                    <td style={{ width: 100 }}><NumInput value={r.unitArea} onChange={(v) => setRow(r.id, { unitArea: Math.max(0, v) })} ariaLabel="مساحة الوحدة" /></td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(rowArea(r), 1)}</td>
                    <td style={{ width: 90 }}><NumInput integer value={r.occupants} onChange={(v) => setRow(r.id, { occupants: Math.max(0, v) })} ariaLabel="المستخدمون" /></td>
                    <td style={{ minWidth: 140 }}><input className="input" value={r.notes} onChange={(e) => setRow(r.id, { notes: e.target.value })} aria-label="ملاحظات" /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost icon sm" aria-label="تكرار" onClick={() => setPr({ spaces: [...pr.spaces, { ...r, id: uid() }] })}><Icon name="copy" /></button>
                      <button className="btn ghost icon sm" aria-label="حذف" onClick={() => setPr({ spaces: pr.spaces.filter((x) => x.id !== r.id) })}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5}>المساحة الصافية الكلية (Net)</td><td className="num">{fmt(sum.net, 1)}</td><td className="num">{sum.occupants || ''}</td><td colSpan={2} /></tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: 8 }}>الطابق: 0 = أرضي، 1 = أول، ‎-1 = قبو. مساحات الوحدات المرجعية: Neufert «Architects' Data» أو مشاريع مشابهة — اذكري المصدر في ملاحظاتك.</p>
      </section>

      <div className="grid split">
        <section className="card">
          <div className="card-head"><h3>من الصافي إلى الإجمالي — Net to gross</h3></div>
          <div className="form-grid">
            <NumField label="نسبة الحركة من الصافي" unit="%" value={pr.circulationPct} onChange={(v) => setPr({ circulationPct: v })} min={0} max={200} hint="مدى شائع 15–35٪ حسب نوع المبنى" />
            <NumField label="الجدران والعناصر الإنشائية" unit="%" value={pr.wallsPct} onChange={(v) => setPr({ wallsPct: v })} min={0} max={100} hint="مدى شائع 8–15٪" />
            <NumField label="نسبة التغطية القصوى" unit="%" value={pr.maxCoveragePct} onChange={(v) => setPr({ maxCoveragePct: v })} min={0} max={100} allowEmpty hint="من نظام البناء — اتركيها فارغة إن لم تُحدد" />
            <NumField label="عامل الاستثمار الأقصى (FAR)" value={pr.maxFar} onChange={(v) => setPr({ maxFar: v })} min={0} allowEmpty />
          </div>
          <div className="result hero" style={{ marginTop: 16 }}>
            <Stat k="الصافي Net" v={<span className="num">{fmt(sum.net, 0)}</span>} unit="m²" />
            <Stat k="الحركة" v={<span className="num">{fmt(sum.circulation, 0)}</span>} unit="m²" />
            <Stat k="الجدران" v={<span className="num">{fmt(sum.walls, 0)}</span>} unit="m²" />
            <Stat k="الإجمالي Gross" v={<span className="num">{fmt(sum.gross, 0)}</span>} unit="m²" />
            <Stat k="الكفاءة Net/Gross" v={<span className="num">{sum.gross ? Math.round(sum.efficiency * 100) + '%' : '—'}</span>} />
          </div>
          <div className="result" style={{ marginTop: 10 }}>
            <Stat k="مساحة الموقع" v={<span className="num">{sum.site ? fmt(sum.site, 0) : '—'}</span>} unit="m²" />
            <Stat k="أكبر طابق (تقديري)" v={<span className="num">{fmt(sum.footprint, 0)}</span>} unit="m²" />
            <Stat k="نسبة التغطية" v={<span className="num">{sum.site ? Math.round(sum.coverage * 100) + '%' : '—'}</span>} />
            <Stat k="عامل الاستثمار FAR" v={<span className="num">{sum.site ? fmt(sum.far, 2) : '—'}</span>} />
          </div>
          {sum.warnings.length > 0 && <div style={{ marginTop: 12 }} className="stack sm">{sum.warnings.map((w) => <Note key={w} kind="warn">{w}</Note>)}</div>}

          <hr className="divider" />
          <div className="label" style={{ marginBottom: 8 }}>مقارنة سيناريوهات الحركة — Efficiency comparison</div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>نسبة الحركة</th><th>الإجمالي م²</th><th>الكفاءة</th><th>FAR</th></tr></thead>
              <tbody>
                {[15, 20, 25, 30, 35].map((c) => {
                  const g = sum.net * (1 + c / 100) * (1 + pr.wallsPct / 100);
                  return (
                    <tr key={c} style={{ background: c === pr.circulationPct ? 'var(--bronze-soft)' : undefined }}>
                      <td className="num">{c}%</td><td className="num">{fmt(g, 0)}</td><td className="num">{g ? Math.round((sum.net / g) * 100) + '%' : '—'}</td><td className="num">{sum.site ? fmt(g / sum.site, 2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="stack" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head"><h3>توزيع المساحات</h3></div>
            {sum.byZone.length === 0 ? <p className="small muted">أضيفي فراغات لرؤية التوزيع.</p> : (
              <div className="stack sm">
                {sum.byZone.sort((a, b) => b.area - a.area).map((z) => {
                  const zone = zones.find((x) => x.id === z.zoneId);
                  const pct = sum.net ? z.area / sum.net : 0;
                  return (
                    <div key={z.zoneId} className="stack" style={{ gap: 3 }}>
                      <div className="row between small"><span>{zone?.name ?? 'بدون نطاق'}</span><span className="num muted">{fmt(z.area, 0)} م² · {Math.round(pct * 100)}%</span></div>
                      <div className="progress"><span style={{ width: `${pct * 100}%`, background: zone?.color ?? 'var(--line-strong)' }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {sum.byFloor.length > 0 && (
              <>
                <hr className="divider" />
                <div className="label" style={{ marginBottom: 6 }}>حسب الطابق (إجمالي تقديري)</div>
                {sum.byFloor.map((f) => (
                  <div key={f.floor} className="row between small"><span>{f.floor === 0 ? 'الأرضي' : f.floor < 0 ? `القبو ${-f.floor}` : `الطابق ${f.floor}`}</span><span className="num">{fmt(f.gross, 0)} م²</span></div>
                ))}
              </>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h3>قائمة التحقق الأولية</h3><span className="badge num">{PROGRAM_CHECKS.filter((c) => pr.checks[c.id]).length}/{PROGRAM_CHECKS.length}</span></div>
            <Checklist items={PROGRAM_CHECKS} state={pr.checks} onToggle={(id, v) => setPr({ checks: { ...pr.checks, [id]: v } })} />
          </section>
        </aside>
      </div>

      {pr.spaces.length >= 2 && (
        <div className="grid split-even">
          <section className="card">
            <div className="card-head"><h3>مصفوفة العلاقات — Adjacency matrix</h3></div>
            <p className="tiny muted">انقري على الخلية للتبديل: ● ضرورية · ○ مرغوبة · ✕ يجب الفصل · فارغة = محايدة.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="adj-matrix">
                <thead>
                  <tr><th />{pr.spaces.map((s, i) => <th key={s.id} title={s.name}>{i + 1}</th>)}</tr>
                </thead>
                <tbody>
                  {pr.spaces.map((a, i) => (
                    <tr key={a.id}>
                      <th style={{ textAlign: 'start' }} title={a.name}>{i + 1}. {a.name || '—'}</th>
                      {pr.spaces.map((b) => {
                        if (a.id === b.id) return <td key={b.id} className="self" />;
                        const k = adjacencyKey(a.id, b.id);
                        const v = pr.adjacency[k] ?? 0;
                        return (
                          <td
                            key={b.id}
                            className={`adj-${v}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${a.name} و ${b.name}`}
                            onClick={() => setPr({ adjacency: { ...pr.adjacency, [k]: ADJ_NEXT[String(v)] } })}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPr({ adjacency: { ...pr.adjacency, [k]: ADJ_NEXT[String(v)] } })}
                          >
                            {ADJ_SYMBOL[String(v)]}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>مخطط العلاقات الفقاعي — Bubble diagram</h3></div>
            <BubbleDiagram spaces={pr.spaces.slice(0, 30)} zones={zones} adjacency={pr.adjacency} />
            <p className="tiny muted" style={{ marginTop: 8 }}>حجم الفقاعة ∝ المساحة، اللون = النطاق. خط عريض = علاقة ضرورية، متقطع = مرغوبة، أحمر منقط = فصل. الترتيب آلي ومبدئي — استعمليه كنقطة انطلاق للتنطيق.</p>
          </section>
        </div>
      )}
    </div>
  );
}
