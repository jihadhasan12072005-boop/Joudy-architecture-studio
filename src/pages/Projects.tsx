import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLive } from '../lib/hooks';
import { createProject, deleteProject, duplicateProject, listProjects, setProjectStatus } from '../db/repo';
import { getDB } from '../db/db';
import type { FileMeta } from '../db/types';
import { Icon } from '../components/Icon';
import { Empty, Modal, Progress, Segmented, TextField, useConfirm, useToast } from '../components/ui';
import { ThumbImage } from '../components/FileThumb';
import { overallProgress } from '../lib/program';
import { dueLabel, relTime } from '../lib/format';
import { AxonHero } from '../components/ArchArt';

export const PROJECT_TYPES = ['سكني', 'تعليمي', 'ثقافي', 'صحي', 'إداري', 'تجاري', 'سياحي / فندقي', 'رياضي', 'متعدد الاستعمالات', 'تصميم حضري', 'أخرى'];

async function load() {
  const projects = await listProjects();
  const db = await getDB();
  const files = (await db.getAll('files')) as FileMeta[];
  const counts = new Map<string, number>();
  const firstImage = new Map<string, string>();
  for (const f of files.sort((a, b) => a.createdAt - b.createdAt)) {
    counts.set(f.projectId, (counts.get(f.projectId) ?? 0) + 1);
    if (f.mime.startsWith('image/') && ['render', 'diagram', 'plan', 'site', 'elevation'].includes(f.category)) firstImage.set(f.projectId, f.id);
  }
  return { projects, counts, firstImage };
}

export function Projects() {
  const data = useLive(load);
  const [filter, setFilter] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const nav = useNavigate();
  if (!data) return <div className="page" />;

  const list = data.projects.filter((p) => p.status === filter && (!q || (p.name + p.type + p.location).includes(q)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Project Studio</div>
          <h1>مشاريعك</h1>
          <p className="lead">كل مشروع يمر بست مراحل: الموقع، الفكرة، البرنامج، المخططات، المراجعة، والعرض النهائي. يُحفظ كل تعديل تلقائياً.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" />مشروع جديد</button>
      </div>

      <div className="row between" style={{ marginBottom: 18 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: `النشطة (${data.projects.filter((p) => p.status === 'active').length})` },
            { value: 'archived', label: `الأرشيف (${data.projects.filter((p) => p.status === 'archived').length})` },
          ]}
        />
        <input className="input" style={{ maxWidth: 280 }} placeholder="بحث في المشاريع…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty icon="folder" title={filter === 'active' ? 'لا توجد مشاريع نشطة' : 'الأرشيف فارغ'}>
            {filter === 'active' && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setCreating(true)}><Icon name="plus" />إنشاء مشروع</button>}
          </Empty>
        </div>
      ) : (
        <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {list.map((p) => {
            const v = overallProgress(p, data.counts.get(p.id) ?? 0);
            const cover = p.coverFileId ?? data.firstImage.get(p.id);
            const dl = p.deadline ? dueLabel(p.deadline) : null;
            return (
              <div key={p.id} className="card project-card" style={{ padding: 14 }}>
                <Link to={`/projects/${p.id}`} className="project-cover" aria-label={`فتح ${p.name}`}>
                  {cover ? <ThumbImage id={cover} alt={p.name} /> : <div style={{ background: 'var(--charcoal)', height: '100%' }}><AxonHero variant="dark" /></div>}
                </Link>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><h3>{p.name}</h3></Link>
                    <div className="small muted">{[p.type, p.location].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  {dl && <span className={`badge ${dl.kind}`}>{dl.text}</span>}
                </div>
                <div className="stack sm">
                  <div className="row between tiny muted"><span>عُدّل {relTime(p.updatedAt)}</span><span className="num">{Math.round(v * 100)}%</span></div>
                  <Progress value={v} />
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Link to={`/projects/${p.id}`} className="btn sm primary">فتح</Link>
                  <button className="btn sm ghost" onClick={async () => { const c = await duplicateProject(p.id); if (c) toast(`أُنشئت نسخة: ${c.name}`); }}><Icon name="copy" />نسخ</button>
                  <button className="btn sm ghost" onClick={() => setProjectStatus(p.id, p.status === 'active' ? 'archived' : 'active').then(() => toast(p.status === 'active' ? 'نُقل إلى الأرشيف' : 'أُعيد من الأرشيف'))}>
                    <Icon name="archive" />{p.status === 'active' ? 'أرشفة' : 'استعادة'}
                  </button>
                  <span className="spacer" />
                  <button
                    className="btn sm ghost danger icon"
                    aria-label={`حذف ${p.name}`}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `حذف «${p.name}»؟`,
                        body: 'سيُحذف المشروع مع كل مخططاته وملفاته ومهامه ومحادثاته من هذا الجهاز نهائياً. إن لم تكوني متأكدة، استعملي الأرشفة بدلاً من الحذف.',
                        confirm: 'حذف نهائي',
                        danger: true,
                      });
                      if (ok) {
                        await deleteProject(p.id);
                        toast('حُذف المشروع');
                      }
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <NewProjectModal onClose={() => setCreating(false)} onCreated={(id) => nav(`/projects/${id}`)} />}
    </div>
  );
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(PROJECT_TYPES[0]);
  const [location, setLocation] = useState('طرطوس');
  const [deadline, setDeadline] = useState('');
  const submit = async () => {
    const p = await createProject({ name: name.trim() || 'مشروع جديد', type, location, deadline });
    onClose();
    onCreated(p.id);
  };
  return (
    <Modal
      title="مشروع جديد"
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={submit}>إنشاء المشروع</button>
          <button className="btn ghost" onClick={onClose}>إلغاء</button>
        </>
      }
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label="اسم المشروع" value={name} onChange={setName} placeholder="مثال: مكتبة عامة على كورنيش طرطوس" />
        <div className="field">
          <label htmlFor="ptype">نوع المشروع</label>
          <select id="ptype" className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <TextField label="الموقع" value={location} onChange={setLocation} />
        <TextField label="موعد التسليم النهائي" type="date" value={deadline} onChange={setDeadline} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
