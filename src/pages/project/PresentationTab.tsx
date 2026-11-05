import { Link } from 'react-router-dom';
import type { TabProps } from './ProjectWorkspace';
import type { PresentationData } from '../../db/types';
import { BOARD_CHECKS } from '../../data/checklists';
import { Checklist, Empty, Note, TextArea, useConfirm } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { uid } from '../../lib/id';
import { dueLabel, todayIso } from '../../lib/format';
import { summarizeProgram } from '../../lib/program';

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SCHEDULE_TEMPLATE: [number, string][] = [
  [-21, 'تثبيت الفكرة والتنطيق'],
  [-14, 'المساقط النهائية بالأبعاد'],
  [-10, 'المقاطع والواجهات'],
  [-7, 'التفاصيل والمواد'],
  [-5, 'الإظهار والمنظورات'],
  [-3, 'إخراج اللوحات'],
  [-1, 'طباعة تجريبية ومراجعة نهائية'],
  [0, 'التسليم'],
];

export function PresentationTab({ project: p, update }: TabProps) {
  const pr = p.presentation;
  const confirm = useConfirm();
  const set = (patch: Partial<PresentationData>) => update((x) => ({ ...x, presentation: { ...x.presentation, ...patch } }));
  const sum = summarizeProgram(p);
  const chosen = p.concept.options.find((o) => o.chosen);

  const descriptionTemplate = [
    `المشروع: ${p.name}${p.type ? ` (${p.type})` : ''}`,
    `الموقع: ${p.location}${sum.site ? ` — مساحة الموقع ${Math.round(sum.site)} م²` : ''}`,
    '',
    '١. قراءة الموقع: (ما أهم ما اكتشفتِه في الموقع؟ الشمس، الإطلالة، الوصول، السياق)',
    p.site.opportunities.length ? `   الفرص: ${p.site.opportunities.join('، ')}` : '',
    p.site.constraints.length ? `   المحددات: ${p.site.constraints.join('، ')}` : '',
    '',
    `٢. الفكرة: ${p.concept.statement || '(بيان الفكرة)'}`,
    chosen ? `   البديل المعتمد: ${chosen.title} — ${chosen.narrative}` : '',
    '',
    '٣. التنظيم الوظيفي والحركة: (كيف توزعت النطاقات؟ أين المدخل؟ كيف تفصلين حركة الزوار عن الخدمة؟)',
    sum.net ? `   المساحة الصافية ${Math.round(sum.net)} م²، الإجمالية التقديرية ${Math.round(sum.gross)} م²، عدد الطوابق ${p.floors}.` : '',
    '',
    '٤. الاستجابة البيئية: (التوجيه، التظليل، التهوية، الإضاءة الطبيعية)',
    '',
    '٥. المواد والإنشاء: (النظام الإنشائي، الشبكة، المواد الرئيسية ولماذا)',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="grid split">
        <section className="stack" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head">
              <h3>بيان الفكرة للعرض — Concept statement</h3>
              {p.concept.statement && <button className="btn sm ghost" onClick={() => set({ conceptStatement: p.concept.statement })}>نسخ من مرحلة الفكرة</button>}
            </div>
            <TextArea label="جملة أو جملتان تُكتب على اللوحة الأولى" value={pr.conceptStatement} onChange={(v) => set({ conceptStatement: v })} rows={3} hint="اختبار جيد: هل يفهم شخص لم يرَ المشروع الفكرةَ من هذه الجملة وحدها؟" />
          </div>
          <div className="card">
            <div className="card-head">
              <h3>الوصف المعماري — Architectural description</h3>
              <button
                className="btn sm"
                onClick={async () => {
                  if (!pr.description.trim() || (await confirm({ title: 'استبدال النص الحالي بالهيكل؟', confirm: 'استبدال' }))) set({ description: descriptionTemplate });
                }}
              >
                <Icon name="list" />هيكل من بيانات المشروع
              </button>
            </div>
            <TextArea label="النص الكامل" value={pr.description} onChange={(v) => set({ description: v })} rows={12} hint="الهيكل يجمع ما أدخلتِه في المراحل السابقة. أكملي الأجزاء بين الأقواس بكلماتك." />
          </div>
        </section>

        <aside className="stack" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head"><h3>جدول التسليم</h3></div>
            {pr.milestones.length === 0 && (
              <div className="stack sm">
                <p className="small muted">أنشئي جدولاً عكسياً من موعد التسليم{p.deadline ? '' : ' (حددي الموعد في تبويب البيانات أولاً)'}.</p>
                <button
                  className="btn sm"
                  disabled={!p.deadline}
                  onClick={() => set({ milestones: SCHEDULE_TEMPLATE.map(([d, t]) => ({ id: uid(), title: t, date: shiftDate(p.deadline, d), done: false })) })}
                >
                  <Icon name="calendar" />إنشاء جدول من موعد التسليم
                </button>
              </div>
            )}
            <div className="stack sm">
              {[...pr.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
                const dl = dueLabel(m.date);
                return (
                  <div key={m.id} className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={m.done} onChange={(e) => set({ milestones: pr.milestones.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x)) })} aria-label="منجز" style={{ accentColor: 'var(--bronze)' }} />
                    <input className="input" style={{ flex: 1, minWidth: 120, textDecoration: m.done ? 'line-through' : undefined }} value={m.title} onChange={(e) => set({ milestones: pr.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })} aria-label="المرحلة" />
                    <input className="input" type="date" style={{ width: 150 }} value={m.date} onChange={(e) => set({ milestones: pr.milestones.map((x) => (x.id === m.id ? { ...x, date: e.target.value } : x)) })} aria-label="التاريخ" />
                    {!m.done && <span className={`badge ${dl.kind}`}>{dl.text}</span>}
                    <button className="btn ghost icon sm" aria-label="حذف" onClick={() => set({ milestones: pr.milestones.filter((x) => x.id !== m.id) })}><Icon name="close" /></button>
                  </div>
                );
              })}
              <button className="btn sm ghost" onClick={() => set({ milestones: [...pr.milestones, { id: uid(), title: 'مرحلة', date: todayIso(), done: false }] })}><Icon name="plus" />إضافة موعد</button>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>قائمة إخراج اللوحات</h3><span className="badge num">{BOARD_CHECKS.filter((c) => pr.boardChecklist[c.id]).length}/{BOARD_CHECKS.length}</span></div>
            <Checklist items={BOARD_CHECKS} state={pr.boardChecklist} onToggle={(id, v) => set({ boardChecklist: { ...pr.boardChecklist, [id]: v } })} />
          </div>
        </aside>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>تخطيط اللوحات — Board planner</h3>
          <div className="row">
            {pr.boards.length === 0 && (
              <button
                className="btn sm"
                onClick={() =>
                  set({
                    boards: [
                      { id: uid(), title: 'اللوحة 1: الموقع والفكرة', contents: 'تحليل الموقع، مخططات الفكرة، بيان الفكرة، المخطط العام', done: false },
                      { id: uid(), title: 'اللوحة 2: المساقط', contents: 'مسقط الأرضي (مع التنسيق)، الطوابق المتكررة، جدول المساحات', done: false },
                      { id: uid(), title: 'اللوحة 3: المقاطع والواجهات', contents: 'مقطعان، الواجهات الأربع، المواد', done: false },
                      { id: uid(), title: 'اللوحة 4: التفاصيل والإظهار', contents: 'تفصيلة جدار/كاسرة، منظور خارجي، منظور داخلي', done: false },
                    ],
                  })
                }
              >
                اقتراح تسلسل من 4 لوحات
              </button>
            )}
            <button className="btn sm primary" onClick={() => set({ boards: [...pr.boards, { id: uid(), title: `اللوحة ${pr.boards.length + 1}`, contents: '', done: false }] })}><Icon name="plus" />لوحة</button>
          </div>
        </div>
        {pr.boards.length === 0 ? (
          <Empty icon="board" title="لم تخططي اللوحات بعد">حددي ماذا تحمل كل لوحة قبل الإخراج — يوفر ساعات من إعادة الترتيب.</Empty>
        ) : (
          <div className="auto-grid">
            {pr.boards.map((b, i) => (
              <div key={b.id} className="card flat stack sm" style={{ background: b.done ? 'var(--sage-soft)' : '#fff', aspectRatio: '1.414 / 1', justifyContent: 'space-between' }}>
                <div className="row between">
                  <span className="badge dark num">{i + 1}</span>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="btn ghost icon sm" aria-label="تقديم" disabled={i === 0} onClick={() => { const a = [...pr.boards]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ boards: a }); }}><Icon name="arrowRight" /></button>
                    <button className="btn ghost icon sm" aria-label="تأخير" disabled={i === pr.boards.length - 1} onClick={() => { const a = [...pr.boards]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set({ boards: a }); }}><Icon name="arrowLeft" /></button>
                    <button className="btn ghost icon sm" aria-label="حذف" onClick={() => set({ boards: pr.boards.filter((x) => x.id !== b.id) })}><Icon name="close" /></button>
                  </div>
                </div>
                <input className="input" style={{ fontWeight: 600 }} value={b.title} onChange={(e) => set({ boards: pr.boards.map((x) => (x.id === b.id ? { ...x, title: e.target.value } : x)) })} aria-label="عنوان اللوحة" />
                <textarea className="textarea" style={{ flex: 1, minHeight: 60 }} value={b.contents} onChange={(e) => set({ boards: pr.boards.map((x) => (x.id === b.id ? { ...x, contents: e.target.value } : x)) })} aria-label="محتوى اللوحة" />
                <label className="check small" style={{ padding: 0 }}>
                  <input type="checkbox" checked={b.done} onChange={(e) => set({ boards: pr.boards.map((x) => (x.id === b.id ? { ...x, done: e.target.checked } : x)) })} />
                  <span>جاهزة</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h3>تقرير المراجعة النهائية</h3></div>
        <TextArea label="ملاحظات أخيرة قبل التسليم" value={pr.finalNotes} onChange={(v) => set({ finalNotes: v })} rows={3} />
        <div className="row" style={{ marginTop: 12 }}>
          <Link to={`/print/${p.id}`} className="btn primary"><Icon name="print" />فتح التقرير الكامل للطباعة / حفظ PDF</Link>
        </div>
        <div style={{ marginTop: 12 }}>
          <Note>التقرير يجمع بيانات المشروع وتحليل الموقع والفكرة وجدول الفراغات والمراجعات ومخططاتك في مستند واحد. اختاري «حفظ كـ PDF» من نافذة الطباعة — تعمل بدون إنترنت ومع الخط العربي بشكل صحيح.</Note>
        </div>
      </section>
    </div>
  );
}
