import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createStudy, deleteStudy, getBlob, getFileMeta, getSettings, listProjects, listStudies } from '../../db/repo';
import { getDB } from '../../db/db';
import type { FileMeta, PlanStudy } from '../../db/types';
import { useLive } from '../../lib/hooks';
import { uid } from '../../lib/id';
import { relTime } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, Note, useConfirm, useToast } from '../../components/ui';
import { FileTile } from '../../components/FileThumb';
import { DEFAULT_PARAMS } from '../../lab/model';
import { drawSamplePlan, isPdfBlob, WORK_MAX_SIDE } from '../../lab/io';
import { LabTutorial } from './LabTutorial';

const TUTORIAL_KEY = 'joudy-lab-tutorial-seen';

export async function startStudy(blob: Blob, name: string, mime: string, projectId: string | null, goal?: string): Promise<PlanStudy> {
  const s: PlanStudy = {
    id: uid(),
    projectId,
    title: name.replace(/\.[^.]+$/, '') || 'دراسة كتلة',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceBlobId: uid(),
    sourceName: name,
    sourceMime: mime || (isPdfBlob('', name) ? 'application/pdf' : 'image/png'),
    pdfPage: 1,
    workMaxSide: WORK_MAX_SIDE,
    params: { ...DEFAULT_PARAMS },
    spaces: [],
    scale: null,
    defaultFloors: 2,
    floorHeight: 3.2,
    mode: 'volumetric',
    explodeGap: 2,
    entrances: [],
    travelLimit: 30,
    northAngle: 0,
    step: 1,
  };
  void goal;
  return createStudy(s, blob);
}

const TASKS: { tab: string; title: string; text: string; art: JSX.Element }[] = [
  { tab: 'm3d', title: 'حوّلي المسقط إلى كتلة ثلاثية الأبعاد', text: 'نموذج تدورينه وتعدّلين ارتفاعاته، مع ظلال حقيقية وتصدير GLB/OBJ.', art: <Iso /> },
  { tab: 'm2d', title: 'مخطط كتلة ثنائي الأبعاد', text: 'مسقط علوي ملوّن بالارتفاعات مع الأفنية، سهم الشمال، ومقياس الرسم.', art: <Plan2D /> },
  { tab: 'zoning', title: 'تنطيق، حركة، ومخطط فقاعي', text: 'ألوان النطاقات، مسافات المشي من المداخل، وعلاقات الفراغات المكتشفة من الأبواب.', art: <Bubbles /> },
  { tab: 'variants', title: 'بدائل للكتلة', text: 'كتلة موحدة، متدرجة، منصة وبرج، وانفتاح حول الفناء — من مسقطك نفسه.', art: <Variants /> },
  { tab: 'sections', title: 'مقاطع وواجهات ودراسة واجهة', text: 'واجهات من الكتلة مع إيقاع الفتحات والتظليل المناسب لكل اتجاه.', art: <Elev /> },
  { tab: 'analysis', title: 'تحليل المسقط واقتراحات', text: 'فراغات بلا إضاءة طبيعية، عمق زائد، فراغات بلا باب، ومسافات هروب طويلة.', art: <Check /> },
  { tab: 'board', title: 'لوحة عرض جاهزة', text: 'لوحة A3 تجمع المنظور ومخطط الكتلة والتنطيق والجدول — PNG و PDF.', art: <Board /> },
];

export function LabIndex() {
  const studies = useLive(listStudies) ?? [];
  const projectFiles = useLive(async () => {
    const db = await getDB();
    const all = ((await db.getAll('files')) as FileMeta[]).filter((f) => f.mime.startsWith('image/') || f.mime === 'application/pdf');
    const latest = new Map<string, FileMeta>();
    for (const f of all) if (!latest.get(f.sheetId) || latest.get(f.sheetId)!.version < f.version) latest.set(f.sheetId, f);
    return [...latest.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  });
  const projects = useLive(listProjects) ?? [];
  const [tutorial, setTutorial] = useState(false);
  const [busy, setBusy] = useState('');
  const [goal, setGoal] = useState('plan');
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_KEY)) setTutorial(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const begin = async (blob: Blob, name: string, mime: string, projectId?: string | null) => {
    setBusy('جارٍ تجهيز الدراسة…');
    try {
      const s = await startStudy(blob, name, mime, projectId ?? (await getSettings()).currentProjectId ?? null);
      nav(`/lab/${s.id}?tab=${goal === 'plan' ? 'plan' : goal}`);
    } catch (e) {
      toast(`تعذّر بدء الدراسة: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  // Deep link from a project drawing: /lab?file=<id>
  useEffect(() => {
    const fid = params.get('file');
    if (!fid) return;
    setParams({}, { replace: true });
    (async () => {
      const meta = await getFileMeta(fid);
      const blob = await getBlob(fid);
      if (meta && blob) await begin(blob, meta.name, meta.mime, meta.projectId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!(f.type.startsWith('image/') || isPdfBlob(f.type, f.name))) return toast('اختاري صورة (PNG/JPG/WebP) أو ملف PDF.', 'error');
    if (f.size > 60 * 1024 * 1024) return toast('الملف أكبر من 60 ميغابايت.', 'error');
    await begin(f, f.name, f.type);
  };

  return (
    <div className="page">
      <section className="lab-hero">
        <div className="stack" style={{ gap: 14 }}>
          <div className="eyebrow">Massing Lab — مختبر الكتلة</div>
          <h1>من المسقط إلى الكتلة، خطوة بخطوة</h1>
          <p className="lead">ارفعي مسقطك المعماري، وسيقرأ التطبيق حدوده وفراغاته وأفنيته، ثم يبني منه كتلة ثنائية وثلاثية الأبعاد تعدّلينها وتصدّرينها للوحاتك. كل المعالجة على جهازك، بدون إنترنت.</p>
          <div className="row">
            <button className="btn bronze lab-cta" onClick={() => input.current?.click()} disabled={!!busy}><Icon name="upload" />ارفعي مسقطاً معمارياً</button>
            <button className="btn" onClick={async () => begin(await drawSamplePlan(), 'مثال تدريبي — مبنى بفناء.png', 'image/png', null)} disabled={!!busy}><Icon name="spark" />جرّبي بمثال جاهز</button>
            <button className="btn ghost" onClick={() => setTutorial(true)}><Icon name="info" />كيف يعمل؟</button>
          </div>
          {busy && <span className="save-dot saving">{busy}</span>}
          <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
          <span className="tiny muted">يدعم: صور PNG / JPG / WebP، لقطات الشاشة، وملفات PDF (أي صفحة). أفضل نتيجة: مسقط بجدران سميكة داكنة على خلفية فاتحة.</span>
        </div>
        <div className="lab-hero-art" aria-hidden="true"><HeroArt /></div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 6 }}>ماذا تريدين أن تفعلي؟</h2>
        <p className="small muted" style={{ marginTop: 0 }}>اختاري المهمة ثم ارفعي المسقط — ستفتح الدراسة مباشرة على الأداة المطلوبة.</p>
        <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))' }}>
          {TASKS.map((t) => (
            <button key={t.tab} type="button" className={`task-card ${goal === t.tab ? 'on' : ''}`} onClick={() => { setGoal(t.tab); input.current?.click(); }}>
              <span className="task-art">{t.art}</span>
              <strong>{t.title}</strong>
              <span className="small muted">{t.text}</span>
            </button>
          ))}
          <div className="task-card disabled" aria-disabled="true">
            <span className="task-art"><Icon name="spark" size={34} /></span>
            <strong>تخطيط داخلي وأثاث، ونقد تصميمي نصي</strong>
            <span className="small muted">يحتاج المساعد الذكي، وهو غير مفعّل حالياً (لا يوجد مزود متاح رسمياً في سوريا).</span>
          </div>
        </div>
      </section>

      {projectFiles && projectFiles.length > 0 && (
        <section className="section">
          <h2 style={{ marginBottom: 12 }}>أو اختاري مخططاً من مشاريعك</h2>
          <div className="thumb-grid">
            {projectFiles.map((f) => (
              <FileTile key={f.id} f={f} onOpen={async () => { const b = await getBlob(f.id); if (b) await begin(b, f.name, f.mime, f.projectId); }} badge={projects.find((p) => p.id === f.projectId)?.name} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 style={{ marginBottom: 12 }}>دراساتك المحفوظة</h2>
        {studies.length === 0 ? (
          <div className="card"><Empty icon="cube" title="لا دراسات بعد">ارفعي مسقطاً أو جرّبي المثال الجاهز.</Empty></div>
        ) : (
          <div className="list card">
            {studies.map((s) => (
              <div key={s.id} className="list-item">
                <Icon name="cube" size={18} />
                <Link to={`/lab/${s.id}`} style={{ flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ fontWeight: 500 }}>{s.title}</div>
                  <div className="tiny muted">{projects.find((p) => p.id === s.projectId)?.name ?? 'بدون مشروع'} · {relTime(s.updatedAt)} · الخطوة {s.step}/6{s.scale ? ' · مقاس' : ' · تقديري'}</div>
                </Link>
                <Link to={`/lab/${s.id}`} className="btn sm">فتح</Link>
                <button className="btn ghost icon sm" aria-label={`حذف ${s.title}`} onClick={async () => { if (await confirm({ title: `حذف «${s.title}»؟`, confirm: 'حذف', danger: true })) await deleteStudy(s.id); }}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <Note kind="info">
          <strong>ما هو دقيق وما هو تقديري؟</strong> الشكل والنِّسَب والأفنية والفراغات مستخرجة فعلاً من صورتك. الأمتار تكون <strong>مقاسة</strong> فقط بعد تحديد بُعد مرجعي (أو العرض الكلي)، وإلا فهي <strong>تقديرية</strong> ويظهر ذلك على كل مخرَج. الأبواب تُكتشف من الفتحات في الجدران. الكتل الناتجة دراسات مفاهيمية (Conceptual massing) وليست نموذج BIM.
        </Note>
      </section>

      {tutorial && <LabTutorial onClose={() => { setTutorial(false); try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ } }} />}
    </div>
  );
}

// --- small illustrations of the expected outputs ---------------------------
function Iso() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      <path d="M20 55l40-20 40 20-40 20z" fill="#efe3d0" stroke="#2e2b27" />
      <path d="M20 55V40l40-20v15zM60 35V20l40 20v15z" fill="#d9c3a5" stroke="#2e2b27" />
      <path d="M48 41l12-6 12 6-12 6z" fill="#b7c7b9" stroke="#2e2b27" />
    </svg>
  );
}
function Plan2D() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      <rect x="15" y="10" width="90" height="60" fill="#c9a27a" stroke="#2e2b27" />
      <rect x="15" y="10" width="40" height="60" fill="#efe3d0" stroke="#2e2b27" />
      <rect x="45" y="30" width="30" height="20" fill="#fff" stroke="#6f8a72" />
      <path d="M48 33l24 14M48 40l17 10M55 31l17 10" stroke="#6f8a72" />
    </svg>
  );
}
function Bubbles() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      <line x1="35" y1="40" x2="75" y2="25" stroke="#2e2b27" strokeWidth="3" />
      <line x1="35" y1="40" x2="80" y2="58" stroke="#2e2b27" strokeDasharray="4 3" />
      <circle cx="35" cy="40" r="18" fill="#C9A27A" stroke="#2e2b27" />
      <circle cx="78" cy="24" r="13" fill="#8C8FB0" stroke="#2e2b27" />
      <circle cx="82" cy="58" r="11" fill="#B9B2A6" stroke="#2e2b27" />
    </svg>
  );
}
function Variants() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(${8 + k * 38} 0)`}>
          <rect x="4" y={60 - (k + 1) * 14} width="14" height={(k + 1) * 14} fill="#d9c3a5" stroke="#2e2b27" />
          <rect x="18" y={60 - (3 - k) * 10} width="12" height={(3 - k) * 10} fill="#efe3d0" stroke="#2e2b27" />
        </g>
      ))}
      <line x1="5" y1="60" x2="115" y2="60" stroke="#2e2b27" strokeWidth="2" />
    </svg>
  );
}
function Elev() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      <path d="M10 65V25h60v-10h40v50z" fill="#f1e5d5" stroke="#2e2b27" />
      {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={16 + k * 18} y="38" width="9" height="12" fill="#cfd8de" stroke="#2e2b27" />)}
      {[0, 1, 2, 3, 4].map((k) => <rect key={`o${k}`} x={14 + k * 18} y="35" width="13" height="2" fill="#2e2b27" />)}
      <line x1="4" y1="65" x2="116" y2="65" stroke="#2e2b27" strokeWidth="2.5" />
    </svg>
  );
}
function Check() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      <rect x="15" y="12" width="90" height="56" fill="#fffdf9" stroke="#2e2b27" strokeWidth="3" />
      <rect x="45" y="30" width="30" height="20" fill="#f6e3df" stroke="#a4443a" strokeDasharray="4 3" />
      <text x="60" y="44" fontSize="12" textAnchor="middle" fill="#a4443a">!</text>
    </svg>
  );
}
function Board() {
  return (
    <svg viewBox="0 0 120 80" className="diagram">
      <rect x="8" y="8" width="104" height="64" fill="#fffdf9" stroke="#2e2b27" />
      <rect x="14" y="14" width="38" height="26" fill="#d9c3a5" />
      <rect x="14" y="44" width="38" height="16" fill="#b7c7b9" />
      <path d="M62 50l20-10 20 10-20 10z" fill="#efe3d0" stroke="#2e2b27" />
      <path d="M62 50V30l20-10v20zM82 40V20l20 10v20z" fill="#c9a27a" stroke="#2e2b27" />
      <rect x="8" y="64" width="104" height="8" fill="#211f1c" />
    </svg>
  );
}
function HeroArt() {
  return (
    <svg viewBox="0 0 420 280" className="diagram">
      <g opacity="0.95">
        <rect x="20" y="40" width="150" height="110" fill="#fff" stroke="#2e2b27" strokeWidth="5" />
        <rect x="70" y="72" width="50" height="40" fill="#fff" stroke="#2e2b27" strokeWidth="4" />
        <line x1="70" y1="40" x2="70" y2="72" stroke="#2e2b27" strokeWidth="4" />
        <line x1="120" y1="112" x2="120" y2="150" stroke="#2e2b27" strokeWidth="4" />
        <line x1="20" y1="96" x2="70" y2="96" stroke="#2e2b27" strokeWidth="4" />
        <text x="95" y="175" textAnchor="middle" fontSize="13" fill="#6e675d">المسقط</text>
      </g>
      <path d="M190 95h40M222 87l8 8-8 8" stroke="#9a6a3c" strokeWidth="3" fill="none" />
      <g transform="translate(250 30)">
        <path d="M0 150l80-40 80 40-80 40z" fill="#efe3d0" stroke="#2e2b27" />
        <path d="M0 150V100l80-40v50zM80 110V60l80 40v50z" fill="#d9c3a5" stroke="#2e2b27" />
        <path d="M0 100l80-40 80 40-80 40z" fill="#c9a27a" stroke="#2e2b27" />
        <path d="M55 100l25-12 25 12-25 12z" fill="#b7c7b9" stroke="#2e2b27" />
        <text x="80" y="215" textAnchor="middle" fontSize="13" fill="#6e675d">الكتلة</text>
      </g>
    </svg>
  );
}
