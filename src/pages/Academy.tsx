import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAutosave, useLive } from '../lib/hooks';
import { getSubjectProgress, listMistakes, listSubjectProgress, saveSubjectProgress } from '../db/repo';
import type { SubjectProgress } from '../db/types';
import { SUBJECTS, SUBJECT_GROUP_LABEL } from '../data/subjects';
import { Icon } from '../components/Icon';
import { Empty, Note, Progress, SaveIndicator, TextArea, TextField } from '../components/ui';
import { uid } from '../lib/id';
import { dueLabel } from '../lib/format';
import { MistakeForm } from './Mistakes';

export function Academy() {
  const progress = useLive(listSubjectProgress) ?? [];
  const mistakes = useLive(listMistakes) ?? [];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Architecture Academy</div>
          <h1>المواد الدراسية</h1>
          <p className="lead">مساحة لكل مادة من موادك الإحدى عشرة: خطة دراسة قابلة للتعديل، تتبع التقدم، موعد الامتحان، الملاحظات، والمراجع، مع ربطها بدفتر الأخطاء.</p>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <Note kind="bronze">
          الخطط المقترحة مبنية على مناهج عمارة وهندسة معيارية ومراجع منشورة، <strong>وليست توصيفاً رسمياً لمقررات جامعة طرطوس</strong>. عدّليها لتطابق محاضراتك. الدروس المشروحة وبنوك الأسئلة المدققة هي محور المرحلة الثانية من التطوير.
        </Note>
      </div>
      <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
        {SUBJECTS.map((s) => {
          const sp = progress.find((x) => x.subjectId === s.id);
          const total = sp?.topics.length ?? 0;
          const done = sp?.topics.filter((t) => t.done).length ?? 0;
          const open = mistakes.filter((m) => m.subjectId === s.id && !m.mastered).length;
          const exam = sp?.examDate ? dueLabel(sp.examDate) : null;
          return (
            <Link key={s.id} to={`/academy/${s.id}`} className="card project-card" style={{ gap: 10 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <span className="subject-num" style={{ fontSize: '2rem' }}>{s.num}</span>
                <span className="badge">{SUBJECT_GROUP_LABEL[s.group]}</span>
              </div>
              <div>
                <h3>{s.ar}</h3>
                <span className="en">{s.en}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>{s.summary}</p>
              <div className="stack sm">
                <div className="row between tiny muted"><span>{total ? `${done}/${total} موضوع` : 'لم تبدئي التتبع'}</span>{total > 0 && <span className="num">{Math.round((done / total) * 100)}%</span>}</div>
                <Progress value={total ? done / total : 0} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                {exam && <span className={`badge ${exam.kind}`}>الامتحان {exam.text}</span>}
                {open > 0 && <span className="badge danger">{open} خطأ للمراجعة</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SubjectPage() {
  const { subjectId = '' } = useParams();
  const subject = SUBJECTS.find((s) => s.id === subjectId);
  const [sp, setSp] = useState<SubjectProgress | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const mistakes = (useLive(listMistakes) ?? []).filter((m) => m.subjectId === subjectId);
  const { schedule, saving } = useAutosave<SubjectProgress>(saveSubjectProgress, 500);

  useEffect(() => {
    getSubjectProgress(subjectId).then((x) => setSp(x ?? { subjectId, topics: [], notes: '', examDate: '', language: '', updatedAt: Date.now() }));
  }, [subjectId]);

  if (!subject) return <div className="page"><Note kind="warn">المادة غير موجودة. <Link to="/academy">رجوع</Link></Note></div>;
  if (!sp) return <div className="page" />;
  const update = (patch: Partial<SubjectProgress>) => {
    const next = { ...sp, ...patch };
    setSp(next);
    schedule(next);
  };
  const done = sp.topics.filter((t) => t.done).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row small muted" style={{ gap: 6 }}><Link to="/academy" style={{ color: 'inherit' }}>المواد</Link><span>/</span><SaveIndicator saving={saving} /></div>
          <h1><span className="subject-num" style={{ fontSize: 'inherit', marginInlineEnd: 10 }}>{subject.num}</span>{subject.ar}</h1>
          <div className="en" style={{ fontSize: '1rem' }}>{subject.en}</div>
          <p className="lead">{subject.summary}</p>
        </div>
      </div>
      {subject.caution && <div style={{ marginBottom: 18 }}><Note kind="warn">{subject.caution}</Note></div>}

      <div className="grid split">
        <div className="stack" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head">
              <h3>خطة الدراسة وتتبع التقدم</h3>
              {sp.topics.length > 0 && <span className="badge num">{done}/{sp.topics.length}</span>}
            </div>
            {sp.topics.length > 0 && <div style={{ marginBottom: 12 }}><Progress value={done / sp.topics.length} /></div>}
            {sp.topics.length === 0 && (
              <div className="stack" style={{ marginBottom: 14 }}>
                <p className="small muted" style={{ margin: 0 }}>ابدئي بالخطة المقترحة ثم عدّليها حسب محاضراتك، أو أضيفي مواضيعك من البداية.</p>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => update({ topics: subject.outline.map((t) => ({ id: uid(), title: t, done: false })) })}>
                  <Icon name="list" />استخدام الخطة المقترحة ({subject.outline.length} مواضيع)
                </button>
              </div>
            )}
            <div className="stack sm">
              {sp.topics.map((t, i) => (
                <div key={t.id} className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={t.done} onChange={(e) => update({ topics: sp.topics.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x)) })} aria-label="منجز" style={{ accentColor: 'var(--bronze)', width: 18, height: 18 }} />
                  <input className="input" style={{ flex: 1, minWidth: 0, textDecoration: t.done ? 'line-through' : undefined, color: t.done ? 'var(--muted)' : undefined }} value={t.title} onChange={(e) => update({ topics: sp.topics.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)) })} aria-label="الموضوع" />
                  <button className="btn ghost icon sm" aria-label="أعلى" disabled={i === 0} onClick={() => { const a = [...sp.topics]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; update({ topics: a }); }}><Icon name="arrowRight" /></button>
                  <button className="btn ghost icon sm" aria-label="حذف" onClick={() => update({ topics: sp.topics.filter((x) => x.id !== t.id) })}><Icon name="close" /></button>
                </div>
              ))}
            </div>
            <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; update({ topics: [...sp.topics, { id: uid(), title: draft.trim(), done: false }] }); setDraft(''); }}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="موضوع من المحاضرات…" aria-label="موضوع جديد" />
              <button className="btn" type="submit"><Icon name="plus" />إضافة</button>
            </form>
          </section>

          <section className="card">
            <div className="card-head"><h3>ملاحظاتي وملخص المراجعة</h3></div>
            <TextArea label="ملاحظات المحاضرات، القوانين المهمة، ملخص قبل الامتحان" value={sp.notes} onChange={(v) => update({ notes: v })} rows={10} />
          </section>

          <section className="card">
            <div className="card-head">
              <h3>أخطاء هذه المادة</h3>
              <button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" />تسجيل خطأ</button>
            </div>
            {adding && <MistakeForm subjectId={subject.id} onDone={() => setAdding(false)} />}
            {mistakes.length === 0 && !adding ? (
              <Empty icon="notebook" title="لا أخطاء مسجلة">عند الخطأ في مسألة أو سؤال، سجليه مع الحل الصحيح والسبب — ثم راجعيه قبل الامتحان.</Empty>
            ) : (
              <div className="list">
                {mistakes.map((m) => (
                  <div key={m.id} className="list-item">
                    <Icon name={m.mastered ? 'check' : 'alert'} size={16} />
                    <span style={{ flex: 1 }}>{m.question}</span>
                    {m.mastered ? <span className="badge sage">أتقنتِه</span> : <span className="badge danger">للمراجعة</span>}
                  </div>
                ))}
                <Link to={`/mistakes?subject=${subject.id}`} className="btn sm ghost" style={{ alignSelf: 'flex-start', marginTop: 8 }}>مراجعة في دفتر الأخطاء</Link>
              </div>
            )}
          </section>
        </div>

        <aside className="stack" style={{ gap: 18 }}>
          <section className="card stack">
            <TextField label="موعد الامتحان" type="date" value={sp.examDate} onChange={(v) => update({ examDate: v })} />
            {sp.examDate && <span className={`badge ${dueLabel(sp.examDate).kind}`} style={{ alignSelf: 'flex-start' }}>{dueLabel(sp.examDate).text}</span>}
            {subject.id === 'programming' && (
              <TextField label="لغة البرمجة المعتمدة في المقرر" value={sp.language ?? ''} onChange={(v) => update({ language: v })} placeholder="مثال: Python أو C++ أو MATLAB" hint="سيُبنى محتوى المادة على اللغة التي تحددينها." />
            )}
          </section>
          <section className="card">
            <div className="card-head"><h3>مراجع معتمدة عالمياً</h3></div>
            <div className="list">
              {subject.references.map((r) => (
                <div key={r.title} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <Icon name="book" size={16} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.title}</div>
                    <div className="tiny muted">{r.author}{r.note ? ` — ${r.note}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>الخطة المقترحة</h3></div>
            <ol className="small muted" style={{ paddingInlineStart: 20, margin: 0, lineHeight: 1.9 }}>{subject.outline.map((o) => <li key={o}>{o}</li>)}</ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
