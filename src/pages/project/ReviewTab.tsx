import { useState } from 'react';
import type { TabProps } from './ProjectWorkspace';
import type { ReviewRound } from '../../db/types';
import { REVIEW_CRITERIA } from '../../data/checklists';
import { Empty, Note, TextArea, useConfirm } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { uid } from '../../lib/id';
import { fmt, fmtDate, todayIso } from '../../lib/format';

export function roundAverage(r: ReviewRound): number | null {
  const vals = Object.values(r.scores).map((s) => s.score).filter((v) => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function ReviewTab({ project: p, update }: TabProps) {
  const [openId, setOpenId] = useState<string | null>(p.reviews[0]?.id ?? null);
  const [actionDraft, setActionDraft] = useState('');
  const confirm = useConfirm();
  const setRound = (id: string, fn: (r: ReviewRound) => ReviewRound) => update((x) => ({ ...x, reviews: x.reviews.map((r) => (r.id === id ? fn(r) : r)) }));
  const round = p.reviews.find((r) => r.id === openId);

  const newRound = (reviewer: string) => {
    const r: ReviewRound = { id: uid(), date: todayIso(), title: `مراجعة ${p.reviews.length + 1}`, reviewer, scores: {}, summary: '', actions: [] };
    update((x) => ({ ...x, reviews: [r, ...x.reviews] }));
    setOpenId(r.id);
  };

  const openActions = p.reviews.flatMap((r) => r.actions.filter((a) => !a.done).map((a) => ({ ...a, round: r })));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row between">
        <div className="row">
          <button className="btn primary" onClick={() => newRound('مراجعة ذاتية')}><Icon name="plus" />مراجعة ذاتية جديدة</button>
          <button className="btn" onClick={() => newRound('تصحيح الأستاذ')}><Icon name="plus" />تسجيل تصحيح الأستاذ</button>
        </div>
        {p.reviews.length > 0 && (
          <select className="select" style={{ width: 'auto' }} value={openId ?? ''} onChange={(e) => setOpenId(e.target.value)} aria-label="اختيار المراجعة">
            {p.reviews.map((r) => <option key={r.id} value={r.id}>{r.title} — {fmtDate(r.date)}</option>)}
          </select>
        )}
      </div>

      {p.reviews.length > 1 && (
        <section className="card">
          <div className="card-head"><h3>تطور التقييم عبر المراجعات</h3></div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>المعيار</th>{[...p.reviews].reverse().map((r) => <th key={r.id}>{r.title}</th>)}</tr>
              </thead>
              <tbody>
                {REVIEW_CRITERIA.map((c) => (
                  <tr key={c.id}>
                    <td>{c.ar} <span className="en">{c.en}</span></td>
                    {[...p.reviews].reverse().map((r) => {
                      const v = r.scores[c.id]?.score ?? 0;
                      return <td key={r.id} className="num">{v ? '●'.repeat(v) + '○'.repeat(5 - v) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>المعدل</td>{[...p.reviews].reverse().map((r) => <td key={r.id} className="num">{roundAverage(r) !== null ? fmt(roundAverage(r)!, 1) : '—'}</td>)}</tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {!round ? (
        <div className="card">
          <Empty icon="target" title="لا مراجعات بعد">
            قيّمي مشروعك بعد كل مرحلة تطوير بالمعايير التسعة. سجّلي أيضاً ملاحظات الأستاذ بعد كل تصحيح لتتحول إلى مهام واضحة.
          </Empty>
        </div>
      ) : (
        <div className="grid split">
          <section className="stack" style={{ gap: 14 }}>
            <div className="card">
              <div className="form-grid">
                <div className="field"><label>العنوان</label><input className="input" value={round.title} onChange={(e) => setRound(round.id, (r) => ({ ...r, title: e.target.value }))} /></div>
                <div className="field"><label>المُراجِع</label><input className="input" value={round.reviewer} onChange={(e) => setRound(round.id, (r) => ({ ...r, reviewer: e.target.value }))} /></div>
                <div className="field"><label>التاريخ</label><input className="input" type="date" value={round.date} onChange={(e) => setRound(round.id, (r) => ({ ...r, date: e.target.value }))} /></div>
              </div>
            </div>
            {REVIEW_CRITERIA.map((c) => {
              const sc = round.scores[c.id] ?? { score: 0, notes: '' };
              const setSc = (patch: Partial<typeof sc>) => setRound(round.id, (r) => ({ ...r, scores: { ...r.scores, [c.id]: { ...sc, ...patch } } }));
              return (
                <div key={c.id} className="card">
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <h3>{c.ar} <span className="en">{c.en}</span></h3>
                    <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label={`تقييم ${c.ar}`}>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          role="radio"
                          aria-checked={sc.score === v}
                          className={`btn sm icon ${sc.score >= v ? 'bronze' : ''}`}
                          onClick={() => setSc({ score: sc.score === v ? 0 : v })}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="small muted" style={{ margin: '0 0 10px', paddingInlineStart: 20 }}>
                    {c.questions.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                  <textarea className="textarea" rows={2} value={sc.notes} onChange={(e) => setSc({ notes: e.target.value })} placeholder="ملاحظاتك: ما المشكلة تحديداً وأين؟" aria-label={`ملاحظات ${c.ar}`} />
                </div>
              );
            })}
          </section>

          <aside className="stack" style={{ gap: 18 }}>
            <section className="card">
              <div className="card-head"><h3>الخلاصة</h3>{roundAverage(round) !== null && <span className="badge bronze num">{fmt(roundAverage(round)!, 1)} / 5</span>}</div>
              <TextArea label="أهم ثلاث ملاحظات" value={round.summary} onChange={(v) => setRound(round.id, (r) => ({ ...r, summary: v }))} rows={5} />
            </section>
            <section className="card">
              <div className="card-head"><h3>الإجراءات المطلوبة</h3></div>
              <div className="row" style={{ marginBottom: 10 }}>
                <input className="input" style={{ flex: 1, minWidth: 0 }} value={actionDraft} onChange={(e) => setActionDraft(e.target.value)} placeholder="مثال: نقل الدرج ليخدم الجناحين" aria-label="إجراء جديد"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && actionDraft.trim()) {
                      setRound(round.id, (r) => ({ ...r, actions: [...r.actions, { id: uid(), text: actionDraft.trim(), done: false }] }));
                      setActionDraft('');
                    }
                  }}
                />
                <button className="btn" onClick={() => { if (!actionDraft.trim()) return; setRound(round.id, (r) => ({ ...r, actions: [...r.actions, { id: uid(), text: actionDraft.trim(), done: false }] })); setActionDraft(''); }}><Icon name="plus" /></button>
              </div>
              {round.actions.map((a) => (
                <label key={a.id} className={`check ${a.done ? 'done' : ''}`}>
                  <input type="checkbox" checked={a.done} onChange={(e) => setRound(round.id, (r) => ({ ...r, actions: r.actions.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)) }))} />
                  <span style={{ flex: 1 }}>{a.text}</span>
                  <button className="btn ghost icon sm" aria-label="حذف" onClick={(e) => { e.preventDefault(); setRound(round.id, (r) => ({ ...r, actions: r.actions.filter((x) => x.id !== a.id) })); }}><Icon name="close" /></button>
                </label>
              ))}
            </section>
            {openActions.length > 0 && (
              <Note kind="bronze">لديك {openActions.length} إجراء مفتوح عبر كل المراجعات.</Note>
            )}
            <button
              className="btn danger"
              onClick={async () => {
                if (await confirm({ title: `حذف «${round.title}»؟`, confirm: 'حذف', danger: true })) {
                  update((x) => ({ ...x, reviews: x.reviews.filter((r) => r.id !== round.id) }));
                  setOpenId(p.reviews.find((r) => r.id !== round.id)?.id ?? null);
                }
              }}
            >
              <Icon name="trash" />حذف هذه المراجعة
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
