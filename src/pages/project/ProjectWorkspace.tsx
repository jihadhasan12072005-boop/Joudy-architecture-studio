import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addRevision, getProject, getSettings, listFiles, listRevisions, logActivity, restoreRevision, saveProject, updateSettings } from '../../db/repo';
import type { Project, Revision, StageKey } from '../../db/types';
import { useAutosave, useLive } from '../../lib/hooks';
import { Icon } from '../../components/Icon';
import { Empty, Modal, Progress, SaveIndicator, useConfirm, useToast } from '../../components/ui';
import { overallProgress, stageProgress, STAGES } from '../../lib/program';
import { fmtDateTime } from '../../lib/format';
import { OverviewTab } from './OverviewTab';
import { SiteTab } from './SiteTab';
import { ConceptTab } from './ConceptTab';
import { ProgramTab } from './ProgramTab';
import { DrawingsTab } from './DrawingsTab';
import { ReviewTab } from './ReviewTab';
import { PresentationTab } from './PresentationTab';
import { TasksTab } from './TasksTab';

export type Update = (fn: (p: Project) => Project) => void;
export interface TabProps {
  project: Project;
  update: Update;
}

type TabKey = 'overview' | StageKey | 'tasks';
const TABS: { key: TabKey; label: string; num?: number }[] = [
  { key: 'overview', label: 'البيانات والبرنامج' },
  ...STAGES.map((s) => ({ key: s.key as TabKey, label: s.ar, num: s.num })),
  { key: 'tasks', label: 'المهام والملاحظات' },
];

export function ProjectWorkspace() {
  const { id = '', tab = 'overview' } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const toast = useToast();
  const fileCount = useLive(async () => (await listFiles(id)).length, [id]) ?? 0;
  const { schedule, flush, saving } = useAutosave<Project>((p) => saveProject(p));

  useEffect(() => {
    let alive = true;
    void flush();
    getProject(id).then((p) => alive && setProject(p ?? null));
    getSettings().then((s) => {
      if (s.currentProjectId !== id) void updateSettings({ currentProjectId: id });
    });
    return () => {
      alive = false;
    };
  }, [id, flush]);

  const update: Update = useCallback(
    (fn) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  if (project === undefined) return <div className="page" />;
  if (project === null)
    return (
      <div className="page">
        <div className="card"><Empty icon="folder" title="المشروع غير موجود">ربما حُذف. <Link to="/projects">العودة إلى المشاريع</Link></Empty></div>
      </div>
    );

  const sp = stageProgress(project, fileCount);
  const active = (TABS.find((t) => t.key === tab)?.key ?? 'overview') as TabKey;
  const props = { project, update };

  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row small muted" style={{ gap: 6 }}>
            <Link to="/projects" style={{ color: 'inherit' }}>المشاريع</Link>
            <span>/</span>
            {project.status === 'archived' && <span className="badge">مؤرشف</span>}
            <SaveIndicator saving={saving} />
          </div>
          <input
            className="display"
            aria-label="اسم المشروع"
            value={project.name}
            onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
            style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', border: 0, background: 'transparent', width: '100%', padding: 0, color: 'var(--charcoal)', outline: 'none' }}
          />
          <div className="row" style={{ maxWidth: 520, marginTop: 4 }}>
            <div style={{ flex: 1 }}><Progress value={overallProgress(project, fileCount)} label="تقدم المشروع" /></div>
            <span className="num small muted">{Math.round(overallProgress(project, fileCount) * 100)}%</span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setHistoryOpen(true)}><Icon name="history" />السجل</button>
          <button
            className="btn"
            onClick={async () => {
              await flush();
              await addRevision(project, 'نسخة يدوية');
              await logActivity(`حفظتِ نسخة من «${project.name}»`, project.id);
              toast('حُفظت نسخة في سجل المشروع');
            }}
          >
            <Icon name="star" />حفظ نسخة
          </button>
          <button className="btn primary" onClick={async () => { await flush(); nav(`/print/${project.id}`); }}><Icon name="print" />تقرير PDF</button>
        </div>
      </div>

      <nav className="tabs" aria-label="مراحل المشروع">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${active === t.key ? 'on' : ''}`} onClick={() => nav(`/projects/${id}/${t.key}`, { replace: true })}>
            {t.num && <span className={`n ${sp[t.key as StageKey] >= 1 ? 'done' : ''}`}>{sp[t.key as StageKey] >= 1 ? '✓' : t.num}</span>}
            {t.label}
          </button>
        ))}
      </nav>

      {active !== 'overview' && active !== 'tasks' && (
        <StageHeader stage={active} value={sp[active]} done={!!project.stageDone[active]} onDone={(v) => update((p) => ({ ...p, stageDone: { ...p.stageDone, [active]: v } }))} />
      )}

      {active === 'overview' && <OverviewTab {...props} />}
      {active === 'site' && <SiteTab {...props} />}
      {active === 'concept' && <ConceptTab {...props} />}
      {active === 'program' && <ProgramTab {...props} />}
      {active === 'drawings' && <DrawingsTab {...props} />}
      {active === 'review' && <ReviewTab {...props} />}
      {active === 'presentation' && <PresentationTab {...props} />}
      {active === 'tasks' && <TasksTab {...props} />}

      {historyOpen && (
        <HistoryModal
          projectId={project.id}
          onClose={() => setHistoryOpen(false)}
          onRestored={(p) => {
            setProject(p);
            setHistoryOpen(false);
            toast('استُعيدت النسخة');
          }}
          beforeRestore={flush}
        />
      )}
    </div>
  );
}

const STAGE_INTRO: Record<StageKey, string> = {
  site: 'افهمي الموقع قبل أن ترسمي: الشمس، الرياح، الوصول، السياق، والإطلالات. الخلاصة هي قائمة فرص ومحددات تقود التصميم.',
  concept: 'صوغي الفكرة كجملة واضحة، طوّري بدائل، وقارنيها بمعايير موزونة بدلاً من الاختيار بالحدس فقط.',
  program: 'حوّلي البرنامج إلى جدول فراغات بمساحات صافية وإجمالية، وحددي العلاقات الوظيفية بين الفراغات.',
  drawings: 'ارفعي المساقط والمقاطع والواجهات، وأضيفي كل تعديل كنسخة جديدة لتقارني تطور التصميم.',
  review: 'قيّمي المشروع بمعايير واضحة بعد كل تصحيح، وحوّلي الملاحظات إلى إجراءات قابلة للتنفيذ.',
  presentation: 'جهّزي بيان الفكرة، الوصف المعماري، تسلسل اللوحات، وجدول التسليم — ثم اطبعي التقرير.',
};

function StageHeader({ stage, value, done, onDone }: { stage: StageKey; value: number; done: boolean; onDone: (v: boolean) => void }) {
  const s = STAGES.find((x) => x.key === stage)!;
  return (
    <div className="card flat" style={{ marginBottom: 20, background: 'var(--paper)' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="eyebrow">Stage {s.num} — {s.en}</div>
          <h2 style={{ margin: '4px 0 6px' }}>المرحلة {s.num}: {s.ar}</h2>
          <p className="small muted" style={{ margin: 0, maxWidth: '80ch' }}>{STAGE_INTRO[stage]}</p>
        </div>
        <div className="stack sm" style={{ minWidth: 200 }}>
          <div className="row between small"><span className="muted">اكتمال المرحلة</span><span className="num">{Math.round(value * 100)}%</span></div>
          <Progress value={value} />
          <label className="check small" style={{ padding: '4px 0' }}>
            <input type="checkbox" checked={done} onChange={(e) => onDone(e.target.checked)} />
            <span>أنهيتُ هذه المرحلة</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ projectId, onClose, onRestored, beforeRestore }: { projectId: string; onClose: () => void; onRestored: (p: Project) => void; beforeRestore: () => Promise<void> }) {
  const revs = useLive(() => listRevisions(projectId), [projectId]);
  const confirm = useConfirm();
  return (
    <Modal title="سجل نسخ المشروع" onClose={onClose}>
      <p className="small muted">يحفظ التطبيق نسخة تلقائية كل 10 دقائق من العمل (حتى 40 نسخة)، ويمكنك حفظ نسخة يدوية في أي وقت. الاستعادة تحفظ النسخة الحالية أولاً، فلا يضيع شيء.</p>
      <div className="list">
        {(revs ?? []).map((r: Revision) => (
          <div key={r.id} className="list-item">
            <Icon name={r.label === 'نسخة يدوية' ? 'star' : 'history'} size={17} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{r.label}</div>
              <div className="tiny muted">{fmtDateTime(r.at)} · {r.snapshot.name}</div>
            </div>
            <button
              className="btn sm"
              onClick={async () => {
                if (await confirm({ title: 'استعادة هذه النسخة؟', body: 'ستُحفظ النسخة الحالية في السجل قبل الاستعادة. الملفات المرفوعة لا تتأثر.', confirm: 'استعادة' })) {
                  await beforeRestore();
                  onRestored(await restoreRevision(r));
                }
              }}
            >
              استعادة
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
