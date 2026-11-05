import { Link, useNavigate } from 'react-router-dom';
import { useLive } from '../lib/hooks';
import {
  getSettings, listMistakes, listProjects, listSubjectProgress, listTasks, recentActivity, recentFiles, saveTask, createProject,
} from '../db/repo';
import { getDB } from '../db/db';
import type { FileMeta, Project } from '../db/types';
import { AxonHero } from '../components/ArchArt';
import { Icon } from '../components/Icon';
import { Empty, Progress, Note } from '../components/ui';
import { FileTile } from '../components/FileThumb';
import { overallProgress, stageProgress, STAGES } from '../lib/program';
import { dueLabel, fmtDate, relTime, daysUntil } from '../lib/format';
import { SUBJECTS } from '../data/subjects';
import { TOOL_LIST } from './tools/toolList';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'سهرة موفقة';
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'نهارك سعيد';
  return 'مساء الخير';
}

interface Deadline { id: string; title: string; due: string; project?: Project; kind: 'task' | 'project' | 'milestone'; taskId?: string }

async function loadDashboard() {
  const [settings, projects, tasks, files, activity, mistakes, subjects] = await Promise.all([
    getSettings(), listProjects(), listTasks(), recentFiles(8), recentActivity(8), listMistakes(), listSubjectProgress(),
  ]);
  const db = await getDB();
  const allFiles = (await db.getAll('files')) as FileMeta[];
  const fileCount = new Map<string, number>();
  for (const f of allFiles) fileCount.set(f.projectId, (fileCount.get(f.projectId) ?? 0) + 1);
  const active = projects.filter((p) => p.status === 'active');
  const current = active.find((p) => p.id === settings.currentProjectId) ?? active[0];

  const deadlines: Deadline[] = [];
  for (const t of tasks) if (!t.done && t.due) deadlines.push({ id: 't' + t.id, taskId: t.id, title: t.title, due: t.due, kind: 'task', project: projects.find((p) => p.id === t.projectId) });
  for (const p of active) {
    if (p.deadline) deadlines.push({ id: 'p' + p.id, title: `التسليم النهائي: ${p.name}`, due: p.deadline, kind: 'project', project: p });
    for (const m of p.presentation.milestones) if (!m.done && m.date) deadlines.push({ id: 'm' + m.id, title: m.title, due: m.date, kind: 'milestone', project: p });
  }
  deadlines.sort((a, b) => a.due.localeCompare(b.due));
  return { settings, projects, active, current, tasks, files, activity, mistakes, subjects, fileCount, deadlines: deadlines.filter((d) => (daysUntil(d.due) ?? 0) >= -14).slice(0, 7) };
}

export function Dashboard() {
  const data = useLive(loadDashboard);
  const nav = useNavigate();
  if (!data) return <div className="page" />;
  const { current, active, files, activity, mistakes, subjects, fileCount, deadlines, settings, tasks } = data;
  const dueMistakes = mistakes.filter((m) => !m.mastered);
  const lastBackupDays = settings.lastBackupAt ? Math.floor((Date.now() - settings.lastBackupAt) / 86400000) : null;
  const hasData = data.projects.length > 0 || mistakes.length > 0;
  const today = new Date();

  const newProject = async () => {
    const p = await createProject();
    nav(`/projects/${p.id}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{fmtDate(today)}</div>
          <h1>{greeting()}، جودي</h1>
          <p className="lead">{current ? `مشروعك الحالي: «${current.name}». ما الخطوة التالية اليوم؟` : 'ابدئي مشروعك الأول، وسيُرتَّب كل شيء هنا.'}</p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={newProject}><Icon name="plus" />مشروع جديد</button>
        </div>
      </div>

      {hasData && (lastBackupDays === null || lastBackupDays > 14) && (
        <div style={{ marginBottom: 18 }}>
          <Note kind="warn">
            {lastBackupDays === null ? 'لم تأخذي نسخة احتياطية بعد.' : `آخر نسخة احتياطية قبل ${lastBackupDays} يوماً.`} البيانات محفوظة في المتصفح على هذا الجهاز فقط —{' '}
            <Link to="/settings">خذي نسخة احتياطية الآن</Link> واحفظيها على فلاشة أو في بريدك.
          </Note>
        </div>
      )}

      <div className="dash-grid">
        {/* Current project */}
        <section className="span-8">
          {current ? (
            <div className="hero-card">
              <div className="art">
                <AxonHero variant="dark" />
              </div>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <span className="badge bronze">المشروع الحالي</span>
                  <h2 style={{ marginTop: 10 }}>{current.name}</h2>
                  <div className="muted small">{[current.type, current.location, current.course].filter(Boolean).join(' · ')}</div>
                </div>
                {current.deadline && <span className={`badge ${dueLabel(current.deadline).kind}`}>{dueLabel(current.deadline).text}</span>}
              </div>
              <div className="stack sm">
                <div className="row between small"><span className="muted">التقدم الكلي</span><span className="num">{Math.round(overallProgress(current, fileCount.get(current.id) ?? 0) * 100)}%</span></div>
                <Progress value={overallProgress(current, fileCount.get(current.id) ?? 0)} />
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  {STAGES.map((s) => {
                    const v = stageProgress(current, fileCount.get(current.id) ?? 0)[s.key];
                    return (
                      <Link key={s.key} to={`/projects/${current.id}/${s.key}`} className="badge" style={{ background: v >= 1 ? 'var(--sage)' : 'rgba(255,255,255,0.1)', color: '#fff', textDecoration: 'none' }}>
                        {s.num}. {s.ar} <span className="num">{Math.round(v * 100)}%</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div className="row">
                <Link to={`/projects/${current.id}`} className="btn bronze">فتح مساحة العمل<Icon name="arrowLeft" /></Link>
                <Link to={`/projects/${current.id}/drawings`} className="btn" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}><Icon name="upload" />رفع مخطط</Link>
              </div>
            </div>
          ) : (
            <div className="hero-card">
              <div className="art"><AxonHero variant="dark" /></div>
              <div>
                <span className="badge bronze">ابدئي من هنا</span>
                <h2 style={{ marginTop: 10 }}>لا يوجد مشروع بعد</h2>
                <p className="muted" style={{ maxWidth: 46 + 'ch' }}>أنشئي مشروعاً وأدخلي برنامج الأستاذ وأبعاد الموقع، وسيقودك الاستوديو عبر المراحل الست حتى العرض النهائي.</p>
              </div>
              <div><button className="btn bronze" onClick={newProject}><Icon name="plus" />إنشاء أول مشروع</button></div>
            </div>
          )}
        </section>

        {/* Deadlines */}
        <section className="span-4 card">
          <div className="card-head"><h3><Icon name="calendar" size={18} />المواعيد القادمة</h3></div>
          {deadlines.length === 0 ? (
            <Empty icon="calendar" title="لا مواعيد قريبة">أضيفي موعد التسليم في بيانات المشروع أو مهام بمواعيد.</Empty>
          ) : (
            <div className="list">
              {deadlines.map((d) => {
                const dl = dueLabel(d.due);
                return (
                  <div className="list-item" key={d.id}>
                    {d.taskId ? (
                      <input
                        type="checkbox"
                        aria-label="إنجاز"
                        style={{ accentColor: 'var(--bronze)', width: 17, height: 17 }}
                        onChange={() => {
                          const t = tasks.find((x) => x.id === d.taskId);
                          if (t) void saveTask({ ...t, done: true });
                        }}
                      />
                    ) : (
                      <Icon name={d.kind === 'project' ? 'flag' : 'clock'} size={17} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{d.title}</div>
                      <div className="tiny muted">{fmtDate(d.due)}{d.project ? ` · ${d.project.name}` : ''}</div>
                    </div>
                    <span className={`badge ${dl.kind}`}>{dl.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent drawings */}
        <section className="span-8 card">
          <div className="card-head">
            <h3><Icon name="image" size={18} />أحدث المخططات</h3>
            {current && <Link to={`/projects/${current.id}/drawings`} className="btn ghost sm">كل المخططات</Link>}
          </div>
          {files.length === 0 ? (
            <Empty icon="image" title="لم ترفعي مخططات بعد">ارفعي المساقط والمقاطع والواجهات من مرحلة «المخططات» داخل المشروع.</Empty>
          ) : (
            <div className="thumb-grid">
              {files.map((f) => (
                <FileTile key={f.id} f={f} badge={f.version > 1 ? `v${f.version}` : undefined} onOpen={() => nav(`/projects/${f.projectId}/drawings?open=${f.id}`)} />
              ))}
            </div>
          )}
        </section>

        {/* Projects progress */}
        <section className="span-4 card">
          <div className="card-head"><h3><Icon name="folder" size={18} />تقدم المشاريع</h3><Link to="/projects" className="btn ghost sm">الكل</Link></div>
          {active.length === 0 ? (
            <Empty icon="folder" title="لا مشاريع نشطة" />
          ) : (
            <div className="stack">
              {active.slice(0, 5).map((p) => {
                const v = overallProgress(p, fileCount.get(p.id) ?? 0);
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }} className="stack sm">
                    <div className="row between"><span style={{ fontWeight: 500 }}>{p.name}</span><span className="num small muted">{Math.round(v * 100)}%</span></div>
                    <Progress value={v} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Subjects */}
        <section className="span-8 card">
          <div className="card-head"><h3><Icon name="book" size={18} />المواد الدراسية</h3><Link to="/academy" className="btn ghost sm">كل المواد</Link></div>
          <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
            {SUBJECTS.map((s) => {
              const sp = subjects.find((x) => x.subjectId === s.id);
              const total = sp?.topics.length ?? 0;
              const done = sp?.topics.filter((t) => t.done).length ?? 0;
              return (
                <Link key={s.id} to={`/academy/${s.id}`} className="subject-tile" style={{ padding: 10 }}>
                  <span className="subject-num">{s.num}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: '0.9rem', display: 'block' }}>{s.ar}</span>
                    {total > 0 ? <Progress value={done / total} /> : <span className="tiny faint">لم تبدئي التتبع</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Mistakes + AI */}
        <section className="span-4 stack">
          <div className="card">
            <div className="card-head"><h3><Icon name="notebook" size={18} />دفتر الأخطاء</h3></div>
            <div className="row between">
              <div className="stat"><span className="v num">{dueMistakes.length}</span><span className="k">بحاجة لمراجعة</span></div>
              <div className="stat"><span className="v num">{mistakes.length - dueMistakes.length}</span><span className="k">أتقنتِها</span></div>
              <Link to="/mistakes" className="btn sm">مراجعة</Link>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3><Icon name="spark" size={18} />المساعد الذكي</h3></div>
            <p className="small muted" style={{ marginBottom: 10 }}>
              {settings.aiEndpoint ? 'متصل بخادمك الخاص. اسأليه عن مخططاتك ومسائلك.' : 'غير مفعّل بعد — بانتظار مزود ذكاء اصطناعي متاح رسمياً في سوريا. باقي التطبيق يعمل بالكامل.'}
            </p>
            <Link to="/assistant" className="btn sm">فتح المساعد</Link>
          </div>
        </section>

        {/* Tools */}
        <section className="span-8 card">
          <div className="card-head"><h3><Icon name="compass" size={18} />أدوات سريعة</h3><Link to="/tools" className="btn ghost sm">كل الأدوات</Link></div>
          <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
            {TOOL_LIST.slice(0, 6).map((t) => (
              <Link key={t.id} to={`/tools/${t.id}`} className="subject-tile" style={{ alignItems: 'center', padding: 12 }}>
                <Icon name={t.icon} size={20} />
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{t.ar}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Activity */}
        <section className="span-4 card">
          <div className="card-head"><h3><Icon name="history" size={18} />آخر النشاطات</h3></div>
          {activity.length === 0 ? (
            <Empty icon="history" title="لا نشاط بعد" />
          ) : (
            <div className="list">
              {activity.map((a) => (
                <div className="list-item small" key={a.id}>
                  <span style={{ flex: 1 }}>{a.text}</span>
                  <span className="tiny faint" style={{ whiteSpace: 'nowrap' }}>{relTime(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
