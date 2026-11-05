import { useState } from 'react';
import type { TabProps } from './ProjectWorkspace';
import type { ConceptOption, Criterion, Zone } from '../../db/types';
import { Empty, TextArea, useConfirm } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { uid } from '../../lib/id';
import { fmt, fmtDateTime } from '../../lib/format';

export function weightedScore(o: ConceptOption, criteria: Criterion[]): number {
  const wsum = criteria.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (wsum === 0) return 0;
  return criteria.reduce((s, c) => s + (o.scores[c.id] ?? 0) * Math.max(0, c.weight), 0) / wsum;
}

export function ConceptTab({ project: p, update }: TabProps) {
  const c = p.concept;
  const confirm = useConfirm();
  const [logDraft, setLogDraft] = useState('');
  const setConcept = (patch: Partial<typeof c>) => update((x) => ({ ...x, concept: { ...x.concept, ...patch } }));
  const setOption = (id: string, patch: Partial<ConceptOption>) => setConcept({ options: c.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const setCriterion = (id: string, patch: Partial<Criterion>) => setConcept({ criteria: c.criteria.map((k) => (k.id === id ? { ...k, ...patch } : k)) });
  const setZone = (id: string, patch: Partial<Zone>) => setConcept({ zones: c.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });

  const ranked = [...c.options].map((o) => ({ o, s: weightedScore(o, c.criteria) })).sort((a, b) => b.s - a.s);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card">
        <div className="card-head"><h3>بيان الفكرة — Concept statement</h3></div>
        <TextArea
          label="الفكرة في جملتين أو ثلاث"
          value={c.statement}
          onChange={(v) => setConcept({ statement: v })}
          rows={3}
          placeholder="مثال: المكتبة كشرفة ثقافية على البحر — تتدرج الكتلة من الشارع المزدحم نحو هدوء الواجهة البحرية، ويصبح الفناء المظلل قلب الحركة."
          hint="الفكرة الجيدة تُقرأ في المسقط والمقطع والواجهة معاً، وتجيب عن مشكلة حقيقية من تحليل الموقع."
        />
      </section>

      <section>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>البدائل التصميمية</h2>
          <button
            className="btn primary"
            onClick={() => setConcept({ options: [...c.options, { id: uid(), title: `بديل ${c.options.length + 1}`, narrative: '', keywords: '', strengths: '', weaknesses: '', scores: {}, chosen: false }] })}
          >
            <Icon name="plus" />إضافة بديل
          </button>
        </div>
        {c.options.length === 0 ? (
          <div className="card"><Empty icon="bulb" title="لا بدائل بعد">طوّري فكرتين أو ثلاثاً مختلفتين جوهرياً (تنظيم، كتلة، علاقة بالموقع) قبل اختيار واحدة.</Empty></div>
        ) : (
          <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
            {c.options.map((o) => (
              <div key={o.id} className="card stack" style={{ borderColor: o.chosen ? 'var(--bronze)' : undefined, boxShadow: o.chosen ? '0 0 0 2px var(--bronze-soft)' : undefined }}>
                <div className="row">
                  <input className="input" style={{ fontWeight: 600, flex: 1 }} value={o.title} onChange={(e) => setOption(o.id, { title: e.target.value })} aria-label="عنوان البديل" />
                  <button
                    className="btn ghost icon sm danger"
                    aria-label="حذف البديل"
                    onClick={async () => {
                      if (await confirm({ title: `حذف «${o.title}»؟`, confirm: 'حذف', danger: true })) setConcept({ options: c.options.filter((x) => x.id !== o.id) });
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <TextArea label="السرد التصميمي" value={o.narrative} onChange={(v) => setOption(o.id, { narrative: v })} rows={3} />
                <div className="field"><label>كلمات مفتاحية</label><input className="input" value={o.keywords} onChange={(e) => setOption(o.id, { keywords: e.target.value })} placeholder="فناء، تدرج، شفافية…" /></div>
                <div className="grid g2" style={{ gap: 10 }}>
                  <TextArea label="نقاط القوة" value={o.strengths} onChange={(v) => setOption(o.id, { strengths: v })} rows={3} />
                  <TextArea label="نقاط الضعف" value={o.weaknesses} onChange={(v) => setOption(o.id, { weaknesses: v })} rows={3} />
                </div>
                <label className="check">
                  <input type="checkbox" checked={o.chosen} onChange={(e) => setConcept({ options: c.options.map((x) => ({ ...x, chosen: x.id === o.id ? e.target.checked : e.target.checked ? false : x.chosen })) })} />
                  <span>البديل المختار للتطوير</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      {c.options.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>مصفوفة المقارنة الموزونة — Weighted comparison</h3>
            <button className="btn sm" onClick={() => setConcept({ criteria: [...c.criteria, { id: uid(), label: 'معيار جديد', weight: 1 }] })}><Icon name="plus" />معيار</button>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>المعيار</th>
                  <th>الوزن</th>
                  {c.options.map((o) => <th key={o.id}>{o.title}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.criteria.map((k) => (
                  <tr key={k.id}>
                    <td style={{ minWidth: 200 }}><input className="input" value={k.label} onChange={(e) => setCriterion(k.id, { label: e.target.value })} aria-label="المعيار" /></td>
                    <td style={{ width: 80 }}>
                      <select className="select" value={k.weight} onChange={(e) => setCriterion(k.id, { weight: Number(e.target.value) })} aria-label="الوزن">
                        {[0, 1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </td>
                    {c.options.map((o) => (
                      <td key={o.id} style={{ width: 90 }}>
                        <select className="select" value={o.scores[k.id] ?? 0} onChange={(e) => setOption(o.id, { scores: { ...o.scores, [k.id]: Number(e.target.value) } })} aria-label={`تقييم ${o.title}`}>
                          <option value={0}>—</option>
                          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                    ))}
                    <td style={{ width: 44 }}>
                      <button className="btn ghost icon sm" aria-label="حذف المعيار" onClick={() => setConcept({ criteria: c.criteria.filter((x) => x.id !== k.id) })}><Icon name="close" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>المعدل الموزون (من 5)</td>
                  {c.options.map((o) => <td key={o.id} className="num">{fmt(weightedScore(o, c.criteria), 2)}</td>)}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {ranked.length > 1 && ranked[0].s > 0 && (
            <p className="small muted" style={{ marginTop: 10 }}>
              الأعلى تقييماً: <strong>{ranked[0].o.title}</strong> ({fmt(ranked[0].s, 2)}). المصفوفة أداة تفكير وليست قراراً آلياً — إن خالفت النتيجة حدسك، اسألي نفسك أي معيار ينقص.
            </p>
          )}
        </section>
      )}

      <div className="grid split-even">
        <section className="card">
          <div className="card-head">
            <h3>النطاقات الوظيفية — Zoning</h3>
            <button className="btn sm" onClick={() => setConcept({ zones: [...c.zones, { id: uid(), name: 'نطاق جديد', color: '#A9B8C9', description: '' }] })}><Icon name="plus" />نطاق</button>
          </div>
          <div className="stack sm">
            {c.zones.map((z) => (
              <div key={z.id} className="row" style={{ alignItems: 'flex-start' }}>
                <input type="color" value={z.color} onChange={(e) => setZone(z.id, { color: e.target.value })} aria-label="لون النطاق" style={{ width: 40, height: 40, border: 0, background: 'none', padding: 0 }} />
                <div className="stack sm" style={{ flex: 1 }}>
                  <input className="input" value={z.name} onChange={(e) => setZone(z.id, { name: e.target.value })} aria-label="اسم النطاق" />
                  <input className="input small" value={z.description} placeholder="وصف / موقع النطاق في المشروع" onChange={(e) => setZone(z.id, { description: e.target.value })} aria-label="وصف النطاق" />
                </div>
                <button
                  className="btn ghost icon sm"
                  aria-label="حذف النطاق"
                  onClick={async () => {
                    const used = p.program.spaces.some((s) => s.zoneId === z.id);
                    if (!used || (await confirm({ title: 'هذا النطاق مستعمل في جدول الفراغات', body: 'ستبقى الفراغات بدون نطاق. متابعة؟', confirm: 'حذف' }))) setConcept({ zones: c.zones.filter((x) => x.id !== z.id) });
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>تُستعمل هذه الألوان في جدول الفراغات ومخطط العلاقات الفقاعي.</p>
        </section>

        <section className="card">
          <div className="card-head"><h3>تطور الفكرة — Concept evolution</h3></div>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" style={{ flex: 1, minWidth: 0 }} value={logDraft} onChange={(e) => setLogDraft(e.target.value)} placeholder="ماذا تغيّر في الفكرة اليوم ولماذا؟" aria-label="ملاحظة تطور" />
            <button
              className="btn"
              onClick={() => {
                if (!logDraft.trim()) return;
                setConcept({ log: [{ id: uid(), at: Date.now(), text: logDraft.trim() }, ...c.log] });
                setLogDraft('');
              }}
            >
              <Icon name="plus" />تسجيل
            </button>
          </div>
          {c.log.length === 0 ? (
            <p className="small muted">سجّلي كل تحول في الفكرة بعد التصحيحات — مفيد جداً عند كتابة وصف المشروع النهائي والدفاع عنه أمام اللجنة.</p>
          ) : (
            <div className="list">
              {c.log.map((l) => (
                <div key={l.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <span className="badge num" style={{ marginTop: 3 }}>{fmtDateTime(l.at).split(' — ')[0]}</span>
                  <span style={{ flex: 1 }}>{l.text}</span>
                  <button className="btn ghost icon sm" aria-label="حذف" onClick={() => setConcept({ log: c.log.filter((x) => x.id !== l.id) })}><Icon name="close" /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
