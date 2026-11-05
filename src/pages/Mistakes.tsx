import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLive } from '../lib/hooks';
import { deleteMistake, listMistakes, saveMistake } from '../db/repo';
import type { Mistake } from '../db/types';
import { SUBJECTS } from '../data/subjects';
import { Icon } from '../components/Icon';
import { Empty, Segmented, useConfirm, useToast } from '../components/ui';
import { uid } from '../lib/id';
import { relTime } from '../lib/format';

export function MistakeForm({ subjectId, onDone, initial }: { subjectId?: string; onDone: () => void; initial?: Mistake }) {
  const [m, setM] = useState<Mistake>(
    initial ?? { id: uid(), subjectId: subjectId ?? SUBJECTS[0].id, topic: '', question: '', myAnswer: '', correctAnswer: '', explanation: '', createdAt: Date.now(), lastReviewedAt: 0, reviewCount: 0, mastered: false },
  );
  const toast = useToast();
  const set = (k: keyof Mistake) => (e: { target: { value: string } }) => setM({ ...m, [k]: e.target.value });
  return (
    <form
      className="card flat stack"
      style={{ background: 'var(--ivory)', marginBottom: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!m.question.trim()) return toast('اكتبي السؤال أو المسألة', 'error');
        await saveMistake(m);
        toast('حُفظ في دفتر الأخطاء');
        onDone();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label>المادة</label>
          <select className="select" value={m.subjectId} onChange={set('subjectId')}>{SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.num}. {s.ar}</option>)}</select>
        </div>
        <div className="field"><label>الموضوع</label><input className="input" value={m.topic} onChange={set('topic')} placeholder="مثال: المقاطع مزدوجة التسليح" /></div>
      </div>
      <div className="field"><label>السؤال / المسألة</label><textarea className="textarea" rows={3} value={m.question} onChange={set('question')} /></div>
      <div className="grid g2" style={{ gap: 10 }}>
        <div className="field"><label>إجابتي (الخاطئة)</label><textarea className="textarea" rows={3} value={m.myAnswer} onChange={set('myAnswer')} /></div>
        <div className="field"><label>الإجابة الصحيحة</label><textarea className="textarea" rows={3} value={m.correctAnswer} onChange={set('correctAnswer')} /></div>
      </div>
      <div className="field"><label>لماذا أخطأت؟ ما القاعدة الصحيحة؟</label><textarea className="textarea" rows={3} value={m.explanation} onChange={set('explanation')} placeholder="مفهوم خاطئ؟ خطأ واحدات؟ نسيان معامل؟" /></div>
      <div className="row">
        <button className="btn primary" type="submit">حفظ</button>
        <button className="btn ghost" type="button" onClick={onDone}>إلغاء</button>
      </div>
    </form>
  );
}

export function Mistakes() {
  const all = useLive(listMistakes) ?? [];
  const [params] = useSearchParams();
  const [subject, setSubject] = useState(params.get('subject') ?? 'all');
  const [view, setView] = useState<'review' | 'all' | 'mastered'>('review');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const confirm = useConfirm();

  const list = all.filter((m) => (subject === 'all' || m.subjectId === subject) && (view === 'all' || (view === 'review' ? !m.mastered : m.mastered)));
  // Review order: least reviewed & longest since last review first.
  if (view === 'review') list.sort((a, b) => a.reviewCount - b.reviewCount || a.lastReviewedAt - b.lastReviewedAt);

  const review = async (m: Mistake, mastered: boolean) => {
    await saveMistake({ ...m, reviewCount: m.reviewCount + 1, lastReviewedAt: Date.now(), mastered });
    setRevealed((s) => { const n = new Set(s); n.delete(m.id); return n; });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Mistake Notebook</div>
          <h1>دفتر الأخطاء</h1>
          <p className="lead">كل خطأ فرصة تعلم. سجّلي السؤال وإجابتك وسبب الخطأ، ثم راجعي: حاولي الحل ذهنياً قبل كشف الإجابة الصحيحة.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />تسجيل خطأ</button>
      </div>

      <div className="row between" style={{ marginBottom: 16 }}>
        <Segmented value={view} onChange={setView} options={[
          { value: 'review', label: `للمراجعة (${all.filter((m) => !m.mastered).length})` },
          { value: 'mastered', label: `أتقنتُها (${all.filter((m) => m.mastered).length})` },
          { value: 'all', label: 'الكل' },
        ]} />
        <select className="select" style={{ maxWidth: 280 }} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="المادة">
          <option value="all">كل المواد</option>
          {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.num}. {s.ar} ({all.filter((m) => m.subjectId === s.id).length})</option>)}
        </select>
      </div>

      {adding && <MistakeForm subjectId={subject !== 'all' ? subject : undefined} onDone={() => setAdding(false)} />}

      {list.length === 0 ? (
        <div className="card"><Empty icon="notebook" title={view === 'review' ? 'لا شيء للمراجعة الآن' : 'لا عناصر'}>{all.length === 0 ? 'ابدئي بتسجيل أول خطأ من مسألة أو امتحان سابق.' : 'أحسنتِ!'}</Empty></div>
      ) : (
        <div className="stack">
          {list.map((m) => {
            const s = SUBJECTS.find((x) => x.id === m.subjectId);
            if (editing === m.id) return <MistakeForm key={m.id} initial={m} onDone={() => setEditing(null)} />;
            const shown = revealed.has(m.id) || view !== 'review';
            return (
              <article key={m.id} className="card">
                <div className="row between" style={{ marginBottom: 8 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="badge bronze">{s?.ar}</span>
                    {m.topic && <span className="badge">{m.topic}</span>}
                    <span className="tiny faint">رُوجع {m.reviewCount} مرة{m.lastReviewedAt ? ` · آخرها ${relTime(m.lastReviewedAt)}` : ''}</span>
                  </div>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="btn ghost icon sm" aria-label="تعديل" onClick={() => setEditing(m.id)}><Icon name="edit" /></button>
                    <button className="btn ghost icon sm" aria-label="حذف" onClick={async () => { if (await confirm({ title: 'حذف هذا الخطأ؟', confirm: 'حذف', danger: true })) await deleteMistake(m.id); }}><Icon name="trash" /></button>
                  </div>
                </div>
                <p style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{m.question}</p>
                {shown ? (
                  <div className="grid g2" style={{ gap: 10, marginTop: 8 }}>
                    <div className="note danger"><div><strong>إجابتي: </strong><span style={{ whiteSpace: 'pre-wrap' }}>{m.myAnswer || '—'}</span></div></div>
                    <div className="note sage"><div><strong>الصحيح: </strong><span style={{ whiteSpace: 'pre-wrap' }}>{m.correctAnswer || '—'}</span></div></div>
                    {m.explanation && <div className="note" style={{ gridColumn: '1 / -1' }}><div><strong>السبب والقاعدة: </strong><span style={{ whiteSpace: 'pre-wrap' }}>{m.explanation}</span></div></div>}
                  </div>
                ) : (
                  <button className="btn sm" onClick={() => setRevealed((x) => new Set(x).add(m.id))}><Icon name="eye" />حاولي الحل ثم اكشفي الإجابة</button>
                )}
                {view === 'review' && shown && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn sm bronze" onClick={() => review(m, true)}><Icon name="check" />فهمتُه — نقل إلى المتقن</button>
                    <button className="btn sm" onClick={() => review(m, false)}>ما زلت أحتاج مراجعة</button>
                  </div>
                )}
                {view === 'mastered' && <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => saveMistake({ ...m, mastered: false })}>إعادة للمراجعة</button>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
