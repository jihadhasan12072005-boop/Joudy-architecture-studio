import { useState } from 'react';
import type { TabProps } from './ProjectWorkspace';
import { deleteTask, listTasks, saveTask } from '../../db/repo';
import { useLive } from '../../lib/hooks';
import { Icon } from '../../components/Icon';
import { Empty, TextArea } from '../../components/ui';
import { uid } from '../../lib/id';
import { dueLabel, fmtDate } from '../../lib/format';

export function TasksTab({ project: p, update }: TabProps) {
  const tasks = useLive(() => listTasks(p.id), [p.id]) ?? [];
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [dec, setDec] = useState({ title: '', reason: '' });
  const [ref, setRef] = useState({ title: '', url: '', note: '' });

  const addTask = async () => {
    if (!title.trim()) return;
    await saveTask({ id: uid(), projectId: p.id, title: title.trim(), due, done: false, createdAt: Date.now() });
    setTitle('');
    setDue('');
  };

  return (
    <div className="grid split-even">
      <div className="stack" style={{ gap: 18 }}>
        <section className="card">
          <div className="card-head"><h3>المهام</h3><span className="badge num">{tasks.filter((t) => !t.done).length} مفتوحة</span></div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void addTask(); }} style={{ marginBottom: 12 }}>
            <input className="input" style={{ flex: 2, minWidth: 160 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مهمة جديدة…" aria-label="مهمة جديدة" />
            <input className="input" type="date" style={{ flex: 1, minWidth: 140 }} value={due} onChange={(e) => setDue(e.target.value)} aria-label="الموعد" />
            <button className="btn primary" type="submit"><Icon name="plus" />إضافة</button>
          </form>
          {tasks.length === 0 ? (
            <Empty icon="check" title="لا مهام">المهام ذات المواعيد تظهر في الصفحة الرئيسية.</Empty>
          ) : (
            <div className="list">
              {tasks.map((t) => {
                const dl = t.due ? dueLabel(t.due) : null;
                return (
                  <div key={t.id} className="list-item">
                    <input type="checkbox" checked={t.done} onChange={(e) => saveTask({ ...t, done: e.target.checked })} aria-label="منجزة" style={{ accentColor: 'var(--bronze)', width: 17, height: 17 }} />
                    <div style={{ flex: 1, textDecoration: t.done ? 'line-through' : undefined, color: t.done ? 'var(--muted)' : undefined }}>
                      {t.title}
                      {t.due && <div className="tiny muted">{fmtDate(t.due)}</div>}
                    </div>
                    {dl && !t.done && <span className={`badge ${dl.kind}`}>{dl.text}</span>}
                    <button className="btn ghost icon sm" aria-label="حذف" onClick={() => deleteTask(t.id)}><Icon name="trash" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>ملاحظات المشروع</h3></div>
          <TextArea label="ملاحظات حرة" value={p.notes} onChange={(v) => update((x) => ({ ...x, notes: v }))} rows={8} />
        </section>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <section className="card">
          <div className="card-head"><h3>القرارات التصميمية — Design decisions</h3></div>
          <div className="stack sm" style={{ marginBottom: 12 }}>
            <input className="input" value={dec.title} onChange={(e) => setDec({ ...dec, title: e.target.value })} placeholder="القرار (مثال: الفناء في الجهة الجنوبية)" aria-label="القرار" />
            <textarea className="textarea" rows={2} value={dec.reason} onChange={(e) => setDec({ ...dec, reason: e.target.value })} placeholder="لماذا؟ (التبرير يفيدك أمام اللجنة)" aria-label="التبرير" />
            <button
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (!dec.title.trim()) return;
                update((x) => ({ ...x, decisions: [{ id: uid(), at: Date.now(), title: dec.title.trim(), reason: dec.reason.trim() }, ...x.decisions] }));
                setDec({ title: '', reason: '' });
              }}
            >
              <Icon name="plus" />تسجيل القرار
            </button>
          </div>
          <div className="list">
            {p.decisions.map((d) => (
              <div key={d.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{d.title}</div>
                  {d.reason && <div className="small muted">{d.reason}</div>}
                  <div className="tiny faint">{fmtDate(d.at)}</div>
                </div>
                <button className="btn ghost icon sm" aria-label="حذف" onClick={() => update((x) => ({ ...x, decisions: x.decisions.filter((y) => y.id !== d.id) }))}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>المراجع والمشاريع المشابهة</h3></div>
          <div className="stack sm" style={{ marginBottom: 12 }}>
            <input className="input" value={ref.title} onChange={(e) => setRef({ ...ref, title: e.target.value })} placeholder="العنوان (كتاب، مشروع مشابه، مقال)" aria-label="عنوان المرجع" />
            <input className="input" dir="ltr" value={ref.url} onChange={(e) => setRef({ ...ref, url: e.target.value })} placeholder="https://…" aria-label="الرابط" />
            <input className="input" value={ref.note} onChange={(e) => setRef({ ...ref, note: e.target.value })} placeholder="ماذا تعلمتِ منه؟" aria-label="ملاحظة" />
            <button
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (!ref.title.trim()) return;
                update((x) => ({ ...x, references: [...x.references, { id: uid(), ...ref, title: ref.title.trim() }] }));
                setRef({ title: '', url: '', note: '' });
              }}
            >
              <Icon name="plus" />إضافة مرجع
            </button>
          </div>
          <div className="list">
            {p.references.map((r) => (
              <div key={r.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Icon name="link" size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/^https?:\/\//.test(r.url) ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : <span style={{ fontWeight: 500 }}>{r.title}</span>}
                  {r.note && <div className="small muted">{r.note}</div>}
                </div>
                <button className="btn ghost icon sm" aria-label="حذف" onClick={() => update((x) => ({ ...x, references: x.references.filter((y) => y.id !== r.id) }))}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
