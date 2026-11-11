import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { putBlob, saveModel, addFile, deleteStudy, getProject, getStudy, listProjects, saveProject, saveStudy } from '../../db/repo';
import type { PlanStudy, SpaceRow } from '../../db/types';
import { useAutosave, useLive } from '../../lib/hooks';
import { Icon } from '../../components/Icon';
import { Note, NumField, Progress, SaveIndicator, Segmented, Stat, useConfirm, useToast } from '../../components/ui';
import { BubbleDiagram } from '../../components/BubbleDiagram';
import { fmt } from '../../lib/format';
import { uid } from '../../lib/id';
import { adjacencyKey } from '../../lib/program';
import { daySummary, localDate, sunPosition } from '../../lib/sun';
import { canvasToPdf, downloadBlobAs, safeName, svgToPng, blobToImage } from '../../lab/io';
import {
  DEFAULT_PARAMS, buildVolumes, elevationProfile, footprintBBox, heightField, scaleFromReference, sectionProfile, sideOrientation, variants,
  type MassingMode, type Side, type SpaceRole, type SpaceSetting, type ZoneKey, type Volume,
} from '../../lab/model';
import type { Pt } from '../../lab/trace';
import type { ViewerApi } from '../../lab/Viewer3D';
import { floorColor, useEngine, useMetrics, ZONE_COLORS, ZONE_LABELS, type Engine } from './engine';
import { PlanCanvas, type Overlay, type Tool } from './PlanCanvas';
import { DIR_LABEL, ElevationSVG, MassingPlan2D, SectionSVG, SIDE_LABEL, type FacadeOptions } from './Diagrams';
import { LabTutorial } from './LabTutorial';


const Viewer3D = lazy(() => import('../../lab/Viewer3D'));

type Tab = 'plan' | 'm3d' | 'm2d' | 'zoning' | 'variants' | 'sections' | 'analysis' | 'board';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'plan', label: 'المسقط والتعرّف', icon: 'image' },
  { key: 'm3d', label: 'الكتلة ثلاثية الأبعاد', icon: 'cube' },
  { key: 'm2d', label: 'مخطط الكتلة 2D', icon: 'layers' },
  { key: 'zoning', label: 'التنطيق والحركة', icon: 'bubbles' },
  { key: 'variants', label: 'بدائل الكتلة', icon: 'grid' },
  { key: 'sections', label: 'مقاطع وواجهات', icon: 'board' },
  { key: 'analysis', label: 'تحليل المسقط', icon: 'target' },
  { key: 'board', label: 'لوحة العرض والتصدير', icon: 'download' },
];

const STEPS = [
  { n: 1, title: 'رفع المسقط', tab: 'plan' as Tab },
  { n: 2, title: 'التعرّف والمقياس', tab: 'plan' as Tab },
  { n: 3, title: 'ثنائي أو ثلاثي الأبعاد', tab: 'm3d' as Tab },
  { n: 4, title: 'الطوابق والارتفاعات', tab: 'm3d' as Tab },
  { n: 5, title: 'التوليد والمعاينة', tab: 'm3d' as Tab },
  { n: 6, title: 'التعديل والتصدير', tab: 'board' as Tab },
];

const GUIDE: Record<Tab, string> = {
  plan: 'تحققي أن الخط البرونزي يحيط بالمبنى كاملاً وأن الفراغات ملونة بشكل صحيح. انقري على أي فراغ لتسميته أو تحويله إلى فناء. إن لم يكن على المخطط مقياس، استعملي «قياس مرجعي» وانقري على طرفي بعد معروف.',
  m3d: 'اختاري نوع الكتلة، وحددي عدد الطوابق وارتفاع الطابق. اسحبي بالفأرة أو بإصبعين لتدوير النموذج، واستعملي العجلة للتكبير. يمكنك إعطاء كل فراغ عدد طوابق مختلفاً من القائمة.',
  m2d: 'مخطط الكتلة من الأعلى: كل لون يمثل ارتفاعاً، والفناء مهشّر. صدّريه PNG أو PDF للوحاتك.',
  zoning: 'أعطي كل فراغ نطاقاً (عام / خاص / خدمات / حركة) من تبويب المسقط، وحددي المداخل لرؤية مسافات المشي. المخطط الفقاعي مبني من الأبواب المكتشفة فعلاً.',
  variants: 'بدائل مولّدة من فراغات مسقطك نفسه — قارني بينها واعتمدي أحدها ثم عدّليه.',
  sections: 'اختاري الواجهة أو خط المقطع. دراسة الواجهة تقترح إيقاع الفتحات والتظليل حسب التوجيه الحقيقي.',
  analysis: 'فحوص آلية مبنية على قواعد معمارية عامة: الإضاءة الطبيعية، عمق الفراغات، الأبواب، ومسافات الهروب. هي مؤشرات للمراجعة وليست حكماً نهائياً.',
  board: 'دوّري النموذج لأفضل زاوية، اختاري محتويات اللوحة، ثم نزّليها PNG أو PDF.',
};

export function LabStudy() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [study, setStudy] = useState<PlanStudy | null | undefined>(undefined);
  const [tutorial, setTutorial] = useState(false);
  const { schedule, saving, flush } = useAutosave<PlanStudy>(saveStudy, 500);
  const nav = useNavigate();
  const confirm = useConfirm();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'plan') as Tab;
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });

  useEffect(() => {
    getStudy(id).then((s) => setStudy(s ?? null));
  }, [id]);

  const update = useCallback(
    (fn: (s: PlanStudy) => PlanStudy) =>
      setStudy((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        schedule(next);
        return next;
      }),
    [schedule],
  );

  const e = useEngine(study ?? null);
  const metrics = useMetrics(e, study ?? null);

  if (study === undefined) return <div className="page" />;
  if (study === null) return <div className="page"><Note kind="warn">الدراسة غير موجودة. <Link to="/lab">العودة إلى مختبر الكتلة</Link></Note></div>;

  const est = e.scale.method === 'estimate';
  const stepDone = (n: number) => n === 1 || (n === 2 && !!study.scale && study.step >= 2) || (n === 3 && study.step >= 3) || (n === 4 && study.step >= 4) || (n === 5 && study.step >= 5) || (n === 6 && study.step >= 6);
  const currentStep = [1, 2, 3, 4, 5, 6].find((n) => !stepDone(n)) ?? 6;

  return (
    <div className="page lab-page">
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row small muted" style={{ gap: 6 }}>
            <Link to="/lab" style={{ color: 'inherit' }}>مختبر الكتلة</Link><span>/</span><SaveIndicator saving={saving} />
          </div>
          <input className="display" aria-label="اسم الدراسة" value={study.title} onChange={(ev) => update((s) => ({ ...s, title: ev.target.value }))}
            style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2.1rem)', border: 0, background: 'transparent', width: '100%', padding: 0, color: 'var(--charcoal)', outline: 'none' }} />
        </div>
        <div className="row">
          <button className="btn" onClick={() => setTutorial(true)}><Icon name="info" />كيف أستخدمه؟</button>
          <button className="btn ghost danger icon" aria-label="حذف الدراسة" onClick={async () => {
            if (await confirm({ title: 'حذف هذه الدراسة؟', body: 'تُحذف الدراسة ونسخة المسقط المحفوظة معها. مخططات مشاريعك لا تتأثر.', confirm: 'حذف', danger: true })) {
              await flush(); await deleteStudy(study.id); nav('/lab');
            }
          }}><Icon name="trash" /></button>
        </div>
      </div>

      <ol className="lab-steps" aria-label="خطوات العمل">
        {STEPS.map((s) => (
          <li key={s.n} className={`${stepDone(s.n) ? 'done' : ''} ${s.n === currentStep ? 'current' : ''}`}>
            <button type="button" onClick={() => setTab(s.tab)}>
              <span className="n">{stepDone(s.n) ? '✓' : s.n}</span>
              <span>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <nav className="tabs" aria-label="أدوات الدراسة">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={16} />{t.label}
          </button>
        ))}
      </nav>

      <div className="note bronze lab-guide"><Icon name="info" /><div>{GUIDE[tab]}</div></div>

      {e.error && <Note kind="danger">{e.error}</Note>}
      {e.busy && <div className="card"><span className="save-dot saving">{e.busy}</span></div>}
      {est && e.ext && tab !== 'plan' && (
        <div style={{ marginBottom: 12 }}>
          <Note kind="warn">الأبعاد <strong>تقديرية</strong> (افترضنا أن طول المبنى 40 م). الشكل والنِّسَب مستخرجة من مسقطك، لكن الأمتار غير مقاسة. <button className="btn sm" onClick={() => setTab('plan')}>حددي المقياس</button></Note>
        </div>
      )}

      {e.ext && e.res && (
        <>
          {tab === 'plan' && <PlanTab study={study} update={update} e={e} onNext={() => { update((s) => ({ ...s, step: Math.max(s.step, 3) })); setTab('m3d'); }} />}
          {tab === 'm3d' && <Massing3DTab study={study} update={update} e={e} />}
          {tab === 'm2d' && <Massing2DTab study={study} e={e} />}
          {tab === 'zoning' && <ZoningTab study={study} update={update} e={e} />}
          {tab === 'variants' && <VariantsTab study={study} update={update} e={e} />}
          {tab === 'sections' && <SectionsTab study={study} update={update} e={e} />}
          {tab === 'analysis' && metrics && <AnalysisTab study={study} e={e} metrics={metrics} setTab={setTab} />}
          {tab === 'board' && metrics && <BoardTab study={study} update={update} e={e} metrics={metrics} />}
        </>
      )}
      {tutorial && <LabTutorial onClose={() => setTutorial(false)} />}
    </div>
  );
}

type Upd = (fn: (s: PlanStudy) => PlanStudy) => void;

function upsertSpace(s: PlanStudy, e: Engine, label: number, patch: Partial<SpaceSetting>): PlanStudy {
  const info = e.ext!.spaces[label - 1];
  const res = e.res!;
  const existing = s.spaces.findIndex((x) => {
    const [sx, sy] = x.seed;
    return e.ext!.labels[Math.round(sy) * e.ext!.w + Math.round(sx)] === label;
  });
  const base: SpaceSetting = existing >= 0 ? s.spaces[existing] : { seed: info.seed, role: res.role[label], floors: null, zone: res.zone[label], name: '' };
  const next = { ...base, ...patch };
  const spaces = [...s.spaces];
  if (existing >= 0) spaces[existing] = next; else spaces.push(next);
  return { ...s, spaces };
}

// ---------------------------------------------------------------------------
// 1. Plan & recognition
// ---------------------------------------------------------------------------
function PlanTab({ study, update, e, onNext }: { study: PlanStudy; update: Upd; e: Engine; onNext: () => void }) {
  const [tool, setTool] = useState<Tool>('select');
  const [overlay, setOverlay] = useState<Overlay>('spaces');
  const [selected, setSelected] = useState<number | null>(null);
  const [refPts, setRefPts] = useState<{ a: Pt; b: Pt } | null>(null);
  const [refM, setRefM] = useState(0);
  const [widthM, setWidthM] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const ext = e.ext!, res = e.res!;
  const m = e.scale.mPerPx;
  const sel = selected ? ext.spaces[selected - 1] : null;
  const p = study.params;
  const setP = (patch: Partial<typeof p>) => update((s) => ({ ...s, params: { ...s.params, ...patch } }));
  const voids = ext.spaces.filter((s) => res.role[s.label] === 'void').length;
  const [bx0, , bx1] = footprintBBox(ext);

  return (
    <div className="lab-split">
      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        <div className="card tight lab-toolbar">
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted">الأداة:</span>
            <Segmented value={tool} onChange={setTool} label="الأداة" options={[{ value: 'select', label: 'تحديد فراغ' }, { value: 'scale', label: 'قياس مرجعي' }, { value: 'entrance', label: 'تحديد مدخل' }]} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted">العرض:</span>
            <Segmented value={overlay} onChange={setOverlay} label="طبقة العرض" options={[{ value: 'spaces', label: 'الفراغات' }, { value: 'zones', label: 'التنطيق' }, { value: 'travel', label: 'مسافات المشي' }, { value: 'source', label: 'الأصل' }]} />
          </div>
        </div>
        {tool === 'scale' && <Note kind="info">انقري على بداية بُعد معروف ثم على نهايته (مثلاً خط أبعاد مكتوب عليه 36.00 m)، ثم أدخلي طوله بالأمتار.</Note>}
        {tool === 'entrance' && <Note kind="info">انقري على كل مدخل للمبنى. النقر قرب مدخل موجود يحذفه. تُستعمل المداخل لحساب مسافات المشي.</Note>}
        <div className="card tight">
          <PlanCanvas
            e={e} tool={tool} overlay={overlay} selected={selected} entrances={study.entrances} scaleRef={study.scale?.ref ? { a: study.scale.ref.a, b: study.scale.ref.b } : refPts}
            travelLimitPx={study.travelLimit / m}
            onPick={(l) => setSelected(l || null)}
            onScalePoints={(a, b) => { setRefPts({ a, b }); setRefM(0); }}
            onEntrance={(pt) => update((s) => {
              const near = s.entrances.findIndex(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < 20);
              return { ...s, entrances: near >= 0 ? s.entrances.filter((_, i) => i !== near) : [...s.entrances, pt] };
            })}
          />
        </div>
        <div className="card">
          <div className="card-head"><h3>الفراغات المكتشفة</h3><span className="badge num">{ext.spaces.length}</span></div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>#</th><th>الاسم</th><th>النوع</th><th>النطاق</th><th>المساحة م²</th><th>الطوابق</th></tr></thead>
              <tbody>
                {ext.spaces.map((s) => (
                  <tr key={s.label} onClick={() => setSelected(s.label)} style={{ cursor: 'pointer', background: selected === s.label ? 'var(--bronze-soft)' : undefined }}>
                    <td className="num">{s.label}</td>
                    <td>{res.name[s.label]}</td>
                    <td>{res.role[s.label] === 'void' ? 'فناء / فراغ مفتوح' : res.role[s.label] === 'circulation' ? 'حركة' : 'فراغ مبني'}</td>
                    <td><span className="badge" style={{ background: ZONE_COLORS[res.zone[s.label]] }}>{ZONE_LABELS[res.zone[s.label]]}</span></td>
                    <td className="num">{fmt(s.area * m * m, 1)}{e.scale.method === 'estimate' ? '*' : ''}</td>
                    <td className="num">{res.role[s.label] === 'void' ? '—' : res.floors[s.label]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {e.scale.method === 'estimate' && <p className="tiny muted" style={{ marginTop: 6 }}>* مساحات تقديرية حتى تحديد المقياس.</p>}
        </div>
      </div>

      <aside className="stack lab-side" style={{ gap: 14 }}>
        <section className="card stack sm">
          <h3>نتيجة التعرّف</h3>
          <div className="result">
            <Stat k="الفراغات" v={<span className="num">{ext.spaces.length}</span>} />
            <Stat k="أفنية" v={<span className="num">{voids}</span>} />
            <Stat k="مساحة المسقط" v={<span className="num">{fmt(ext.footprintPx * m * m, 0)}</span>} unit={est(e) ? 'm² *' : 'm²'} />
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>الخط البرونزي = حدود المبنى المكتشفة. الأفنية المقترحة آلياً هي الفراغات الكبيرة المحاطة بالمبنى من كل الجهات — تأكدي منها.</p>
          <button className="btn primary" onClick={() => { update((s) => ({ ...s, step: Math.max(s.step, 2) })); onNext(); }}>
            النتيجة مقبولة — أنشئي الكتلة<Icon name="arrowLeft" />
          </button>
        </section>

        {sel && (
          <section className="card stack sm" aria-label="الفراغ المحدد">
            <div className="row between"><h3>الفراغ {sel.label}</h3><button className="btn ghost icon sm" aria-label="إلغاء التحديد" onClick={() => setSelected(null)}><Icon name="close" /></button></div>
            <div className="field"><label htmlFor="spn">الاسم</label><input id="spn" className="input" value={res.name[sel.label]} onChange={(ev) => update((s) => upsertSpace(s, e, sel.label, { name: ev.target.value }))} /></div>
            <div className="field">
              <label>النوع</label>
              <Segmented value={res.role[sel.label]} onChange={(v: SpaceRole) => update((s) => upsertSpace(s, e, sel.label, { role: v }))} options={[{ value: 'space', label: 'فراغ مبني' }, { value: 'void', label: 'فناء' }, { value: 'circulation', label: 'حركة' }]} />
            </div>
            <div className="field">
              <label htmlFor="spz">النطاق الوظيفي</label>
              <select id="spz" className="select" value={res.zone[sel.label]} onChange={(ev) => update((s) => upsertSpace(s, e, sel.label, { zone: ev.target.value as ZoneKey }))}>
                {Object.entries(ZONE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {res.role[sel.label] !== 'void' && (
              <NumField label="عدد الطوابق لهذا الجزء" value={res.floors[sel.label]} min={1} max={60} onChange={(v) => update((s) => upsertSpace(s, e, sel.label, { floors: Math.max(1, Math.round(v || 1)) }))} />
            )}
            <div className="tiny muted">المساحة الصافية: {fmt(sel.area * m * m, 1)} م²{est(e) ? ' (تقديرية)' : ''}</div>
          </section>
        )}

        <section className="card stack sm">
          <h3>المقياس</h3>
          {study.scale && study.scale.method !== 'estimate' ? (
            <Note kind="sage" icon="check">
              مقاس: 1 بكسل = {fmt(study.scale.mPerPx * 100, 2)} سم {study.scale.ref ? `(مرجع ${study.scale.ref.meters} م)` : '(من عرض المبنى)'}
            </Note>
          ) : (
            <Note kind="warn">لم يُحدد مقياس — الأبعاد تقديرية.</Note>
          )}
          {refPts && (
            <div className="stack sm">
              <NumField label="طول البعد الذي حددتِه" unit="m" value={refM} onChange={setRefM} min={0} allowEmpty />
              <button className="btn bronze sm" disabled={!(refM > 0)} onClick={() => { update((s) => ({ ...s, scale: scaleFromReference(refPts.a, refPts.b, refM), step: Math.max(s.step, 2) })); setRefPts(null); setTool('select'); }}>اعتماد المقياس</button>
            </div>
          )}
          <div className="row" style={{ alignItems: 'flex-end', gap: 6 }}>
            <div style={{ flex: 1 }}><NumField label="أو: العرض الكلي للمبنى (أفقياً)" unit="m" value={widthM} onChange={setWidthM} min={0} allowEmpty /></div>
            <button className="btn sm" disabled={!(widthM > 0)} onClick={() => update((s) => ({ ...s, scale: { mPerPx: widthM / Math.max(1, bx1 - bx0), method: 'width' }, step: Math.max(s.step, 2) }))}>اعتماد</button>
          </div>
          {study.scale && <button className="btn ghost sm" onClick={() => update((s) => ({ ...s, scale: null }))}>إلغاء المقياس</button>}
        </section>

        {e.pages > 1 && (
          <section className="card stack sm">
            <h3>صفحة PDF</h3>
            <select className="select" value={study.pdfPage} onChange={(ev) => update((s) => ({ ...s, pdfPage: Number(ev.target.value), spaces: [], scale: null, entrances: [] }))} aria-label="الصفحة">
              {Array.from({ length: e.pages }, (_, i) => <option key={i} value={i + 1}>صفحة {i + 1}</option>)}
            </select>
          </section>
        )}

        <section className="card stack sm">
          <button className="btn ghost sm" style={{ justifyContent: 'space-between' }} onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
            <span>التعرّف غير دقيق؟ اضبطي الإعدادات</span><Icon name={advanced ? 'arrowRight' : 'arrowLeft'} />
          </button>
          {advanced && (
            <div className="stack sm">
              <Slider label="حد اللون (الحبر)" value={p.threshold ?? ext.used.threshold} min={30} max={240} auto={p.threshold === null} onAuto={() => setP({ threshold: null })} onChange={(v) => setP({ threshold: v })} hint="ارفعيه إذا ضاعت جدران فاتحة، اخفضيه إذا ظهرت ظلال وتعبئات كجدران." />
              <Slider label="تجاهل الخطوط الرفيعة" value={p.thinLine ?? ext.used.thinLine} min={0} max={4} auto={p.thinLine === null} onAuto={() => setP({ thinLine: null })} onChange={(v) => setP({ thinLine: v })} hint="يحذف النصوص والأثاث وخطوط الأبعاد. 0 إذا كانت الجدران مرسومة بخط واحد." />
              <Slider label="سد فتحات الأبواب" value={p.doorGap ?? ext.used.doorGap} min={0} max={40} auto={p.doorGap === null} onAuto={() => setP({ doorGap: null })} onChange={(v) => setP({ doorGap: v })} hint="ارفعيه إذا اندمجت غرف عبر الأبواب؛ اخفضيه إذا اختفت ممرات ضيقة." />
              <Slider label="سد فتحات الواجهة (نوافذ ومداخل)" value={p.outlineGap ?? ext.used.outlineGap} min={0} max={80} auto={p.outlineGap === null} onAuto={() => setP({ outlineGap: null })} onChange={(v) => setP({ outlineGap: v })} hint="ارفعيه إذا تسرّب الخارج إلى داخل المبنى عبر نافذة." />
              <label className="check small"><input type="checkbox" checked={p.invert} onChange={(ev) => setP({ invert: ev.target.checked })} /><span>خطوط فاتحة على خلفية داكنة</span></label>
              <button className="btn sm ghost" onClick={() => update((s) => ({ ...s, params: { ...DEFAULT_PARAMS } }))}>إعادة كل الإعدادات إلى آلي</button>
              <p className="tiny muted" style={{ margin: 0 }}>سماكة الجدار المقدرة: {fmt(ext.wallPx, 1)} بكسل{!est(e) ? ` ≈ ${fmt(ext.wallPx * m * 100, 0)} سم` : ''}.</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

const est = (e: Engine) => e.scale.method === 'estimate';

function Slider({ label, value, min, max, auto, onAuto, onChange, hint }: { label: string; value: number; min: number; max: number; auto: boolean; onAuto: () => void; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="field">
      <div className="row between"><label>{label}</label><span className="row" style={{ gap: 6 }}><span className="num small">{value}</span>{auto ? <span className="badge sage">آلي</span> : <button className="btn ghost sm" onClick={onAuto}>آلي</button>}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(ev) => onChange(Number(ev.target.value))} style={{ accentColor: 'var(--bronze)' }} aria-label={label} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. 3D massing
// ---------------------------------------------------------------------------
function useSun(e: Engine, enabled: boolean, month: number, hour: number) {
  return useMemo(() => {
    if (!enabled) return null;
    const y = new Date().getFullYear();
    const p = sunPosition(localDate(y, month, 21, Math.floor(hour), Math.round((hour % 1) * 60), e.location.utc), e.location.lat, e.location.lon);
    return { altitude: p.altitude, azimuth: p.azimuth };
  }, [enabled, month, hour, e.location.lat, e.location.lon, e.location.utc]);
}

function colorFn(_e: Engine, colorBy: 'height' | 'zone', vols: Volume[]) {
  const maxF = Math.max(1, ...vols.map((v) => v.floors));
  const minF = Math.min(maxF, ...vols.map((v) => v.floors));
  return (v: Volume, i: number) => {
    if (colorBy === 'zone') return '#efe8dc';
    if (vols.some((x) => x.level > 0)) return i % 2 ? '#e7dccb' : '#d9c3a5';
    return floorColor(v.floors, maxF, minF);
  };
}

function ExportButtons({ api, name, study }: { api: ViewerApi | null; name: string; study: PlanStudy }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const saveToProject = async () => {
    if (!api || !study.projectId) return;
    const png = await api.snapshot(2);
    await addFile({ projectId: study.projectId, blob: png, name: `${safeName(name)}-3d.png`, category: 'diagram', title: `كتلة: ${study.title}` });
    toast('حُفظت صورة الكتلة في مخططات المشروع');
  };
  return (
    <div className="stack sm">
      <div className="label">تنزيل</div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sm" disabled={!api || busy} onClick={async () => { setBusy(true); downloadBlobAs(await api!.snapshot(2), `${safeName(name)}-3d.png`); setBusy(false); }}><Icon name="image" />PNG</button>
        <button className="btn sm" disabled={!api || busy} onClick={async () => {
          setBusy(true);
          const img = await blobToImage(await api!.snapshot(2));
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          downloadBlobAs(await canvasToPdf(c), `${safeName(name)}-3d.pdf`); setBusy(false);
        }}><Icon name="pdf" />PDF</button>
        <button className="btn sm" disabled={!api || busy} onClick={async () => { setBusy(true); downloadBlobAs(await api!.exportGLB(), `${safeName(name)}.glb`); setBusy(false); }}><Icon name="cube" />GLB</button>
        <button className="btn sm" disabled={!api} onClick={() => downloadBlobAs(api!.exportOBJ(), `${safeName(name)}.obj`)}><Icon name="cube" />OBJ</button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>GLB يفتح في Blender و SketchUp (عبر إضافة) و Windows 3D Viewer؛ OBJ يُستورد في Rhino و 3ds Max و SketchUp. الوحدة: متر.</p>
      {study.projectId && <button className="btn sm ghost" disabled={!api} onClick={saveToProject}><Icon name="upload" />حفظ الصورة في مخططات المشروع</button>}
    </div>
  );
}

function Massing3DTab({ study, update, e }: { study: PlanStudy; update: Upd; e: Engine }) {
  const [api, setApi] = useState<ViewerApi | null>(null);
  const [edges, setEdges] = useState(true);
  const [floorLines, setFloorLines] = useState(true);
  const [sunOn, setSunOn] = useState(false);
  const [month, setMonth] = useState(6);
  const [hour, setHour] = useState(15);
  const sun = useSun(e, sunOn, month, hour);
  const ext = e.ext!, res = e.res!;
  const color = useMemo(() => colorFn(e, 'height', e.volumes), [e.volumes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (study.step < 5) update((s) => ({ ...s, step: Math.max(s.step, 5) })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const totalH = Math.max(0, ...e.volumes.map((v) => v.z1));
  return (
    <div className="lab-split">
      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        <div className="card tight viewer-card">
          <Suspense fallback={<div className="viewer3d center muted">جارٍ تحميل العارض ثلاثي الأبعاد…</div>}>
            <Viewer3D volumes={e.volumes} mPerPx={e.scale.mPerPx} center={e.center} colorOf={color} edges={edges} floorLines={floorLines && study.mode !== 'exploded'} floorHeight={study.floorHeight} sun={sun} northAngle={e.location.northAngle} onReady={setApi} height="min(62vh, 620px)" />
          </Suspense>
          <div className="row viewer-views" style={{ gap: 6 }}>
            {(['persp', 'axon', 'top', 'front'] as const).map((v) => (
              <button key={v} className="btn sm" disabled={!api} onClick={() => api?.setView(v)}>{{ persp: 'منظور', axon: 'أكسونومتري', top: 'من الأعلى', front: 'أمامي' }[v]}</button>
            ))}
            <span className="tiny muted">اسحبي للتدوير · عجلة/إصبعان للتكبير · زر أيمن للتحريك</span>
          </div>
        </div>
        <div className="result">
          <Stat k="الارتفاع الأقصى" v={<span className="num">{fmt(totalH, 1)}</span>} unit="m" />
          <Stat k="عدد الكتل" v={<span className="num">{e.volumes.reduce((a, v) => a + v.polys.length, 0)}</span>} />
          <Stat k="المقياس" v={est(e) ? 'تقديري' : 'مقاس'} />
        </div>
      </div>
      <aside className="stack lab-side" style={{ gap: 14 }}>
        <section className="card stack sm">
          <h3>نوع الكتلة</h3>
          <Segmented value={study.mode} onChange={(v: MassingMode) => update((s) => ({ ...s, mode: v, step: Math.max(s.step, 3) }))} options={[{ value: 'block', label: 'كتلة بسيطة' }, { value: 'volumetric', label: 'دراسة حجمية' }, { value: 'exploded', label: 'كتلة مفككة' }]} />
          <p className="tiny muted" style={{ margin: 0 }}>
            {study.mode === 'block' ? 'كل المبنى بارتفاع واحد — أوضح قراءة للمسقط والأفنية.' : study.mode === 'volumetric' ? 'كل فراغ بعدد طوابقه — حددي الطوابق لكل جزء من القائمة أدناه.' : 'كل طابق صفيحة منفصلة — لشرح توزيع الطوابق في اللوحات.'}
          </p>
        </section>
        <section className="card stack sm">
          <h3>الطوابق والارتفاعات</h3>
          <div className="grid g2" style={{ gap: 8 }}>
            <NumField label="عدد الطوابق (افتراضي)" value={study.defaultFloors} min={1} max={60} onChange={(v) => update((s) => ({ ...s, defaultFloors: Math.max(1, Math.round(v || 1)), step: Math.max(s.step, 4) }))} />
            <NumField label="ارتفاع الطابق" unit="m" value={study.floorHeight} min={2.4} max={12} onChange={(v) => update((s) => ({ ...s, floorHeight: v > 0 ? v : 3.2, step: Math.max(s.step, 4) }))} />
          </div>
          {study.mode === 'exploded' && <NumField label="المسافة بين الطوابق المفككة" unit="m" value={study.explodeGap} min={0} max={20} onChange={(v) => update((s) => ({ ...s, explodeGap: v }))} />}
          {study.mode === 'volumetric' && (
            <div className="stack sm" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {ext.spaces.filter((s) => res.role[s.label] !== 'void').map((s) => (
                <div key={s.label} className="row between small">
                  <span>{res.name[s.label]}</span>
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn sm icon" aria-label={`إنقاص طوابق ${res.name[s.label]}`} onClick={() => update((st) => upsertSpace(st, e, s.label, { floors: Math.max(1, res.floors[s.label] - 1) }))}>−</button>
                    <span className="num" style={{ minWidth: 26, textAlign: 'center' }}>{res.floors[s.label]}</span>
                    <button className="btn sm icon" aria-label={`زيادة طوابق ${res.name[s.label]}`} onClick={() => update((st) => upsertSpace(st, e, s.label, { floors: res.floors[s.label] + 1 }))}>+</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card stack sm">
          <h3>العرض</h3>
          <label className="check small"><input type="checkbox" checked={edges} onChange={(ev) => setEdges(ev.target.checked)} /><span>حواف الكتل</span></label>
          <label className="check small"><input type="checkbox" checked={floorLines} onChange={(ev) => setFloorLines(ev.target.checked)} /><span>خطوط الطوابق</span></label>
          <label className="check small"><input type="checkbox" checked={sunOn} onChange={(ev) => setSunOn(ev.target.checked)} /><span>دراسة الظلال (الشمس الحقيقية {e.location.fromProject ? 'لموقع المشروع' : 'لطرطوس'})</span></label>
          {sunOn && (
            <div className="stack sm">
              <div className="row between small"><span>الشهر: {month}</span><span>الساعة: {fmt(hour, 2)}</span></div>
              <input type="range" min={1} max={12} value={month} onChange={(ev) => setMonth(Number(ev.target.value))} aria-label="الشهر" style={{ accentColor: 'var(--bronze)' }} />
              <input type="range" min={6} max={19} step={0.25} value={hour} onChange={(ev) => setHour(Number(ev.target.value))} aria-label="الساعة" style={{ accentColor: 'var(--bronze)' }} />
              {sun && <span className="tiny muted">ارتفاع الشمس {fmt(sun.altitude, 0)}° · السمت {fmt(sun.azimuth, 0)}°{sun.altitude <= 0 ? ' — الشمس تحت الأفق' : ''}</span>}
            </div>
          )}
          <NumField label="زاوية الشمال (مع عقارب الساعة من أعلى المخطط)" unit="°" value={study.northAngle} min={-360} max={360} onChange={(v) => update((s) => ({ ...s, northAngle: v }))} />
        </section>
        <section className="card"><ExportButtons api={api} name={study.title} study={study} /></section>
        <OpenInEditor study={study} e={e} />
      </aside>
    </div>
  );
}

/** Convert the generated massing into editable masses in the massing editor. */
function OpenInEditor({ study, e }: { study: PlanStudy; e: Engine }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!e.ext || !e.field || !e.raster) return;
    setBusy(true);
    const [{ newModel }, { massFromWorld, MASS_COLORS }] = await Promise.all([import('../../editor/model'), import('../../editor/geom')]);
    const k = e.scale.mPerPx;
    const vols = buildVolumes(e.ext, e.field, 'volumetric', study.floorHeight);
    const model = newModel(`${study.title} (تعديل يدوي)`, study.projectId);
    let n = 0;
    for (const v of vols) for (const p of v.polys) {
      n++;
      model.masses.push(massFromWorld(p.outer.map(([x, y]) => [x * k, y * k] as [number, number]), {
        name: `كتلة ${n} (${v.floors} ط)`, height: v.floors * study.floorHeight, floorHeight: study.floorHeight, color: MASS_COLORS[(n - 1) % MASS_COLORS.length],
      }, p.holes.map((h) => h.map(([x, y]) => [x * k, y * k] as [number, number]))));
    }
    const blob = await new Promise<Blob>((r) => e.raster!.canvas.toBlob((b) => r(b!), 'image/png'));
    const blobId = uid();
    await putBlob(blobId, blob);
    const w = e.raster.w * k;
    model.reference = { blobId, mime: 'image/png', name: study.sourceName, widthM: w, aspect: e.raster.h / e.raster.w, x: w / 2, z: (e.raster.h * k) / 2, rot: 0, opacity: 0.5, locked: true, visible: true };
    model.measured = e.scale.method !== 'estimate';
    model.scaleNote = model.measured ? 'المقياس منقول من دراسة مختبر الكتلة.' : '';
    await saveModel(model);
    nav(`/editor/${model.id}`);
  };
  return (
    <section className="card stack sm">
      <h3>تريدين التحكم الكامل؟</h3>
      <p className="small muted" style={{ margin: 0 }}>افتحي هذه الكتل في «محرر الكتل» لتحريكها وتعديل حدودها وأسقفها بنفسك.</p>
      <button className="btn bronze sm" disabled={busy || !e.volumes.length} onClick={go}><Icon name="edit" />فتح في محرر الكتل</button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. 2D massing plan
// ---------------------------------------------------------------------------
function SvgExports({ svg, name, label }: { svg: SVGSVGElement | null; name: string; label?: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {label && <span className="small muted">{label}</span>}
      <button className="btn sm" disabled={!svg} onClick={async () => downloadBlobAs(await svgToPng(svg!, 3), `${safeName(name)}.png`)}><Icon name="image" />PNG</button>
      <button className="btn sm" disabled={!svg} onClick={async () => {
        const img = await blobToImage(await svgToPng(svg!, 3));
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        downloadBlobAs(await canvasToPdf(c), `${safeName(name)}.pdf`);
      }}><Icon name="pdf" />PDF</button>
      <button className="btn sm" disabled={!svg} onClick={() => {
        const c = svg!.cloneNode(true) as SVGSVGElement;
        c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        downloadBlobAs(new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' }), `${safeName(name)}.svg`);
      }}><Icon name="file" />SVG</button>
    </div>
  );
}

function Massing2DTab({ study, e }: { study: PlanStudy; e: Engine }) {
  const ref = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);
  useEffect(() => force((x) => x + 1), []);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between"><h2>مخطط الكتلة من الأعلى</h2><SvgExports svg={ref.current} name={`${study.title}-massing-plan`} /></div>
      <div className="card tight"><MassingPlan2D ref={ref} e={e} colorBy="height" northAngle={e.location.northAngle} floorHeight={study.floorHeight} title={study.title} /></div>
      <p className="tiny muted">SVG قابل للتعديل في Illustrator / Inkscape. الألوان من الأفتح (طوابق أقل) إلى الأغمق (طوابق أكثر).</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Zoning, circulation, bubble diagram
// ---------------------------------------------------------------------------
function ZoningTab({ study, update, e }: { study: PlanStudy; update: Upd; e: Engine }) {
  const ref = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);
  useEffect(() => force((x) => x + 1), []);
  const projects = useLive(listProjects) ?? [];
  const toast = useToast();
  const ext = e.ext!, res = e.res!;
  const m = e.scale.mPerPx;
  const metrics = useMetrics(e, study);
  const spaces = ext.spaces.filter((s) => res.role[s.label] !== 'void');
  const rows: SpaceRow[] = spaces.map((s) => ({ id: `lab-${s.label}`, name: res.name[s.label], zoneId: res.zone[s.label] || 'none', floor: 0, quantity: 1, unitArea: Math.round(s.area * m * m * 10) / 10, occupants: 0, notes: '' }));
  const zones = Object.entries(ZONE_COLORS).map(([k, c]) => ({ id: k || 'none', name: ZONE_LABELS[k], color: c, description: '' }));
  const adjacency: Record<string, 2 | 1> = {};
  for (const [a, b] of ext.touching) if (res.role[a] !== 'void' && res.role[b] !== 'void') adjacency[adjacencyKey(`lab-${a}`, `lab-${b}`)] = 1;
  for (const [a, b] of ext.doors) if (res.role[a] !== 'void' && res.role[b] !== 'void') adjacency[adjacencyKey(`lab-${a}`, `lab-${b}`)] = 2;

  const importToProject = async (pid: string) => {
    const p = await getProject(pid);
    if (!p) return;
    const idMap = new Map<string, string>();
    const zoneMap: Record<string, string | undefined> = {
      public: p.concept.zones.find((z) => z.name.includes('Public') || z.name.startsWith('عام'))?.id,
      semi: p.concept.zones.find((z) => z.name.includes('Semi'))?.id,
      private: p.concept.zones.find((z) => z.name.includes('Private'))?.id,
      service: p.concept.zones.find((z) => z.name.includes('Service'))?.id,
    };
    const newRows = rows.map((r) => {
      const nid = uid();
      idMap.set(r.id, nid);
      return { ...r, id: nid, zoneId: zoneMap[r.zoneId] ?? '', notes: `من دراسة «${study.title}»${est(e) ? ' — مساحة تقديرية' : ''}` };
    });
    const adj = { ...p.program.adjacency };
    for (const [k, v] of Object.entries(adjacency)) {
      const [a, b] = k.split('|');
      if (idMap.get(a) && idMap.get(b)) adj[adjacencyKey(idMap.get(a)!, idMap.get(b)!)] = v;
    }
    await saveProject({ ...p, program: { ...p.program, spaces: [...p.program.spaces, ...newRows], adjacency: adj } });
    toast(`أُضيف ${newRows.length} فراغ إلى جدول «${p.name}»`);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid split-even">
        <section className="card stack sm">
          <div className="row between"><h3>مخطط التنطيق الوظيفي</h3><SvgExports svg={ref.current} name={`${study.title}-zoning`} /></div>
          <MassingPlan2D ref={ref} e={e} colorBy="zone" northAngle={e.location.northAngle} floorHeight={study.floorHeight} />
          {spaces.every((s) => !res.zone[s.label]) && <Note kind="info">لم تُحدَّد النطاقات بعد: من تبويب «المسقط والتعرّف» انقري على كل فراغ واختاري نطاقه.</Note>}
        </section>
        <section className="card stack sm">
          <h3>الحركة ومسافات المشي</h3>
          {study.entrances.length === 0 ? (
            <Note kind="info">حددي المداخل أولاً: تبويب «المسقط والتعرّف» ← أداة «تحديد مدخل».</Note>
          ) : (
            <>
              <PlanCanvas e={e} tool="entrance" overlay="travel" selected={null} entrances={study.entrances} scaleRef={null} travelLimitPx={study.travelLimit / m}
                onPick={() => {}} onScalePoints={() => {}} onEntrance={(pt) => update((s) => {
                  const near = s.entrances.findIndex(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < 20);
                  return { ...s, entrances: near >= 0 ? s.entrances.filter((_, i) => i !== near) : [...s.entrances, pt] };
                })} />
              <div className="row small" style={{ gap: 10 }}>
                <span className="legend"><i style={{ background: 'rgb(111,160,120)' }} />قريب</span>
                <span className="legend"><i style={{ background: 'rgb(231,120,60)' }} />بعيد</span>
                <span className="legend"><i style={{ background: 'rgb(164,68,58)' }} />يتجاوز الحد</span>
              </div>
              <NumField label="الحد المرجعي لمسافة الهروب" unit="m" value={study.travelLimit} min={5} max={120} onChange={(v) => update((s) => ({ ...s, travelLimit: v || 30 }))} hint="الحدود الفعلية تحددها أنظمة الحريق المحلية حسب نوع المبنى ووجود الرشاشات." />
              {metrics?.maxTravelM !== null && metrics && <div className="result"><Stat k="أبعد مسافة مشي من مدخل" v={<span className="num">{fmt(metrics.maxTravelM!, 0)}</span>} unit={est(e) ? 'm *' : 'm'} /></div>}
            </>
          )}
        </section>
      </div>
      <section className="card stack sm">
        <div className="row between">
          <h3>المخطط الفقاعي المستخرج من المسقط</h3>
          {projects.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              <select className="select" style={{ width: 'auto' }} defaultValue={study.projectId ?? ''} id="imp" aria-label="المشروع">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn sm" onClick={() => importToProject((document.getElementById('imp') as HTMLSelectElement).value)}><Icon name="list" />استيراد الفراغات إلى جدول المشروع</button>
            </div>
          )}
        </div>
        <BubbleDiagram spaces={rows.slice(0, 30)} zones={zones} adjacency={adjacency} />
        <p className="tiny muted">خط عريض = باب مكتشف بين الفراغين · متقطع = جدار مشترك فقط. حجم الفقاعة ∝ المساحة. الأبواب تُكتشف من الفتحات في الجدران — الأبواب المرسومة كخط مغلق لا تُكتشف.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Variants
// ---------------------------------------------------------------------------
function VariantsTab({ study, update, e }: { study: PlanStudy; update: Upd; e: Engine }) {
  const ext = e.ext!, res = e.res!;
  const list = useMemo(() => variants(ext, res, study.defaultFloors), [ext, res, study.defaultFloors]);
  const toast = useToast();
  const vols = useMemo(() => list.map((v) => buildVolumes(ext, heightField(ext, { ...res, floors: v.floors }), 'volumetric', study.floorHeight)), [list, ext, res, study.floorHeight]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted" style={{ margin: 0 }}>كل البدائل تحافظ على مسقطك وأفنيتك كما هي، وتغيّر توزيع الارتفاعات فقط. بعد الاعتماد يمكنك تعديل طوابق كل جزء.</p>
      <div className="auto-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
        {list.map((v, i) => {
          const maxF = Math.max(1, ...vols[i].map((x) => x.floors));
          const minF = Math.min(maxF, ...vols[i].map((x) => x.floors));
          const gfa = ext.spaces.reduce((a, s) => a + (res.role[s.label] === 'void' ? 0 : s.area * v.floors[s.label]), 0) * e.scale.mPerPx ** 2;
          return (
            <div key={v.key} className="card stack sm">
              <Suspense fallback={<div className="viewer3d center muted" style={{ height: 220 }}>…</div>}>
                <Viewer3D volumes={vols[i]} mPerPx={e.scale.mPerPx} center={e.center} colorOf={(x) => floorColor(x.floors, maxF, minF)} edges floorLines={false} floorHeight={study.floorHeight} sun={null} northAngle={0} height={220} />
              </Suspense>
              <h3>{v.title}</h3>
              <p className="small muted" style={{ margin: 0 }}>{v.description}</p>
              <div className="tiny muted">مساحة طابقية تقريبية (صافي الفراغات): {fmt(gfa, 0)} م²{est(e) ? ' *' : ''} · أعلى نقطة {maxF} طوابق</div>
              <button className="btn sm primary" onClick={() => {
                update((s) => ({
                  ...s,
                  mode: 'volumetric',
                  spaces: ext.spaces.map((sp) => {
                    const prev = s.spaces.find((x) => ext.labels[Math.round(x.seed[1]) * ext.w + Math.round(x.seed[0])] === sp.label);
                    return { seed: sp.seed, role: res.role[sp.label], zone: res.zone[sp.label], name: prev?.name ?? '', floors: v.floors[sp.label] };
                  }),
                }));
                toast(`اعتُمد بديل «${v.title}» — عدّليه من تبويب الكتلة`);
              }}>اعتماد هذا البديل</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Sections & elevations
// ---------------------------------------------------------------------------
function SectionsTab({ study, e }: { study: PlanStudy; update: Upd; e: Engine }) {
  const [side, setSide] = useState<Side>('bottom');
  const [facade, setFacade] = useState<Omit<FacadeOptions, 'summerNoonAlt'>>({ enabled: true, bayM: 4, wwr: 0.3, sillM: 0.9, windowHM: 1.5 });
  const [axis, setAxis] = useState<'h' | 'v'>('h');
  const [pos, setPos] = useState(0.5);
  const elevRef = useRef<SVGSVGElement>(null);
  const secRef = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);
  useEffect(() => force((x) => x + 1), [side, axis]);
  const ext = e.ext!, field = e.field!;
  const prof = useMemo(() => elevationProfile(ext, field, side), [ext, field, side]);
  const sec = useMemo(() => sectionProfile(ext, field, axis, pos), [ext, field, axis, pos]);
  const orient = sideOrientation(side, e.location.northAngle);
  const summer = useMemo(() => daySummary('', new Date().getFullYear(), 6, 21, e.location.lat, e.location.lon, e.location.utc).noonAltitude, [e.location]);
  const [bx0, by0, bx1, by1] = footprintBBox(ext);
  const advice: Record<string, string> = {
    S: 'الجنوبية: أفضل واجهة للتحكم بالشمس — كاسرات أفقية بعمق محسوب تحجب شمس الصيف العالية وتُدخل شمس الشتاء.',
    N: 'الشمالية: ضوء منتشر ثابت مناسب للمراسم والقراءة — نوافذ أوسع ممكنة دون تظليل، مع انتباه للعزل الحراري شتاءً.',
    E: 'الشرقية: شمس صباحية منخفضة — زعانف عمودية أو مشربيات، ونسبة فتحات معتدلة.',
    W: 'الغربية: أصعب واجهة صيفاً (شمس منخفضة حارة بعد الظهر) — قلّلي الفتحات واستعملي زعانف عمودية أو كاسرات متحركة.',
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card stack sm">
        <div className="row between">
          <h3>الواجهة + دراسة الواجهة</h3>
          <SvgExports svg={elevRef.current} name={`${study.title}-elevation-${side}`} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Segmented value={side} onChange={setSide} label="الواجهة" options={(['bottom', 'right', 'top', 'left'] as Side[]).map((s) => ({ value: s, label: `${SIDE_LABEL[s]} (${DIR_LABEL[sideOrientation(s, e.location.northAngle)]})` }))} />
        </div>
        <ElevationSVG ref={elevRef} profile={prof} mPerPx={e.scale.mPerPx} floorHeight={study.floorHeight} title={`الواجهة ${DIR_LABEL[orient]} — ${SIDE_LABEL[side]}`} orientation={orient} facade={{ ...facade, summerNoonAlt: summer }} estimated={est(e)} />
        <div className="grid g4" style={{ gap: 8 }}>
          <NumField label="عرض الفتحة الإنشائية (Bay)" unit="m" value={facade.bayM} min={1.5} max={15} onChange={(v) => setFacade({ ...facade, bayM: v || 4 })} />
          <NumField label="نسبة الفتحات WWR" unit="%" value={Math.round(facade.wwr * 100)} min={5} max={90} onChange={(v) => setFacade({ ...facade, wwr: Math.min(0.9, Math.max(0.05, v / 100)) })} />
          <NumField label="ارتفاع الجلسة" unit="m" value={facade.sillM} min={0} max={2} onChange={(v) => setFacade({ ...facade, sillM: v })} />
          <NumField label="ارتفاع النافذة" unit="m" value={facade.windowHM} min={0.5} max={study.floorHeight - 0.3} onChange={(v) => setFacade({ ...facade, windowHM: v || 1.5 })} />
        </div>
        <label className="check small"><input type="checkbox" checked={facade.enabled} onChange={(ev) => setFacade({ ...facade, enabled: ev.target.checked })} /><span>إظهار دراسة الفتحات والتظليل</span></label>
        <Note kind="bronze">{advice[orient]}{e.location.northAngle === 0 && !e.location.fromProject ? ' (افترضنا أن الشمال لأعلى المخطط — عدّلي زاوية الشمال من تبويب الكتلة.)' : ''}</Note>
      </section>
      <section className="card stack sm">
        <div className="row between">
          <h3>مقطع كتلي</h3>
          <SvgExports svg={secRef.current} name={`${study.title}-section`} />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Segmented value={axis} onChange={setAxis} options={[{ value: 'h', label: 'مقطع أفقي (يمين–يسار)' }, { value: 'v', label: 'مقطع عمودي (أعلى–أسفل)' }]} />
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>موضع خط المقطع</label>
            <input type="range" min={axis === 'h' ? by0 / ext.h : bx0 / ext.w} max={axis === 'h' ? by1 / ext.h : bx1 / ext.w} step={0.002} value={pos} onChange={(ev) => setPos(Number(ev.target.value))} aria-label="موضع خط المقطع" style={{ accentColor: 'var(--bronze)' }} />
          </div>
        </div>
        <div className="grid split-even">
          <SectionKey e={e} axis={axis} pos={pos} />
          <SectionSVG ref={secRef} {...sec} mPerPx={e.scale.mPerPx} floorHeight={study.floorHeight} title={`مقطع ${axis === 'h' ? 'أ–أ' : 'ب–ب'}`} estimated={est(e)} />
        </div>
      </section>
    </div>
  );
}

function SectionKey({ e, axis, pos }: { e: Engine; axis: 'h' | 'v'; pos: number }) {
  const ext = e.ext!;
  const [x0, y0, x1, y1] = footprintBBox(ext);
  const pad = 20;
  const href = useMemo(() => e.raster!.canvas.toDataURL('image/jpeg', 0.7), [e.raster]);
  return (
    <svg viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`} className="diagram" style={{ background: '#fff', maxHeight: 320 }} aria-label="مفتاح موقع المقطع">
      <image href={href} x={0} y={0} width={ext.w} height={ext.h} opacity={0.45} />
      {axis === 'h'
        ? <line x1={x0 - pad} x2={x1 + pad} y1={pos * (ext.h - 1)} y2={pos * (ext.h - 1)} stroke="#a4443a" strokeWidth={3} strokeDasharray="12 6" />
        : <line y1={y0 - pad} y2={y1 + pad} x1={pos * (ext.w - 1)} x2={pos * (ext.w - 1)} stroke="#a4443a" strokeWidth={3} strokeDasharray="12 6" />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 7. Analysis
// ---------------------------------------------------------------------------
function AnalysisTab({ study, e, metrics, setTab }: { study: PlanStudy; e: Engine; metrics: NonNullable<ReturnType<typeof useMetrics>>; setTab: (t: Tab) => void }) {
  const star = est(e) ? ' *' : '';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="result hero">
        <Stat k="مساحة البصمة المبنية" v={<span className="num">{fmt(metrics.footprintM2, 0)}</span>} unit={'m²' + star} />
        <Stat k="الأفنية" v={<span className="num">{fmt(metrics.courtyardM2, 0)}</span>} unit={'m²' + star} />
        <Stat k="المساحة الطابقية GFA" v={<span className="num">{fmt(metrics.gfaM2, 0)}</span>} unit={'m²' + star} />
        <Stat k="المحيط" v={<span className="num">{fmt(metrics.perimeterM, 0)}</span>} unit={'m' + star} />
        <Stat k="الانضغاط 4πA/P²" v={<span className="num">{fmt(metrics.compactness, 2)}</span>} />
        <Stat k="سماكة الجدار المقدرة" v={<span className="num">{fmt(metrics.wallThicknessM * 100, 0)}</span>} unit={'cm' + star} />
      </div>
      {est(e) && <Note kind="warn">* القيم تقديرية لأن المقياس غير محدد. حددي المقياس من تبويب المسقط لتصبح المساحات والمسافات مقاسة.</Note>}
      <div className="grid split">
        <section className="card">
          <div className="card-head"><h3>ملاحظات ومقترحات</h3><span className="badge num">{metrics.issues.length}</span></div>
          {metrics.issues.length === 0 ? <Note kind="sage" icon="check">لم تُكتشف مشكلات وفق الفحوص الآلية.{study.entrances.length === 0 ? ' حددي المداخل لفحص مسافات الهروب أيضاً.' : ''}</Note> : (
            <div className="stack sm">{metrics.issues.map((i, k) => <Note key={k} kind={i.level === 'warn' ? 'warn' : 'info'}>{i.text}</Note>)}</div>
          )}
          {study.entrances.length === 0 && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setTab('plan')}>تحديد المداخل لفحص الحركة</button>}
        </section>
        <section className="card stack sm">
          <h3>ماذا تفحص الأداة؟</h3>
          <ul className="small muted" style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.9 }}>
            <li>هل يلامس كل فراغ واجهة أو فناء (إضاءة وتهوية طبيعية)؟</li>
            <li>عمق الفراغ عن أقرب واجهة (قاعدة 6–7.5 م للإضاءة الجانبية).</li>
            <li>وجود باب مقروء يربط الفراغ بغيره.</li>
            <li>أبعد مسافة مشي إلى مدخل، مقارنة بحد مرجعي تحددينه.</li>
            <li>نسبة الحركة إن حددتِ فراغات الحركة.</li>
          </ul>
          <p className="tiny faint" style={{ margin: 0 }}>لا تفحص الأداة: الأثاث، الأبعاد الدقيقة للأبواب، الإنشاء، أو جمالية التصميم — هذه تحتاج عينك ومراجعة الأستاذ.</p>
          {metrics.circulationPct !== null && <div className="result"><Stat k="نسبة الحركة" v={<span className="num">{fmt(metrics.circulationPct, 0)}%</span>} /></div>}
        </section>
      </div>
      <section className="card">
        <div className="card-head"><h3>جدول الفراغات المقاسة</h3></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>الفراغ</th><th>النوع</th><th>المساحة م²</th><th>طوابق</th><th>واجهة/فناء</th><th>أقصى عمق م</th><th>أبواب</th><th>أبعد مشي م</th></tr></thead>
            <tbody>
              {metrics.spaces.map((s) => (
                <tr key={s.label}>
                  <td>{s.name}</td>
                  <td>{s.role === 'void' ? 'فناء' : s.role === 'circulation' ? 'حركة' : 'فراغ'}</td>
                  <td className="num">{fmt(s.areaM2, 1)}</td>
                  <td className="num">{s.floors || '—'}</td>
                  <td>{s.role === 'void' ? '—' : s.hasFacade ? <span className="badge sage">نعم</span> : <span className="badge danger">لا</span>}</td>
                  <td className="num">{s.role === 'void' ? '—' : fmt(s.maxDepthM, 1)}</td>
                  <td className="num">{s.doors}</td>
                  <td className="num">{s.travelM === null ? '—' : fmt(s.travelM, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Presentation board
// ---------------------------------------------------------------------------
function BoardTab({ study, update, e, metrics }: { study: PlanStudy; update: Upd; e: Engine; metrics: NonNullable<ReturnType<typeof useMetrics>> }) {
  const [api, setApi] = useState<ViewerApi | null>(null);
  const planRef = useRef<SVGSVGElement>(null);
  const zoneRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState({ zoning: true, table: true, source: true });
  const sheet = useRef<HTMLCanvasElement | null>(null);
  const color = useMemo(() => colorFn(e, 'height', e.volumes), [e.volumes]); // eslint-disable-line react-hooks/exhaustive-deps
  const projectName = useLive(async () => (study.projectId ? (await getProject(study.projectId))?.name ?? '' : ''), [study.projectId]) ?? '';

  const compose = async () => {
    if (!api) return;
    setBusy(true);
    const W = 2480, H = 1754; // A3 landscape ≈ 210 dpi
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fffdf9'; g.fillRect(0, 0, W, H);
    g.direction = 'rtl';
    const M = 70;
    // title block
    g.fillStyle = '#211f1c'; g.fillRect(0, H - 150, W, 150);
    g.fillStyle = '#f6f1e9'; g.textAlign = 'right';
    g.font = 'bold 54px Amiri, "IBM Plex Sans Arabic", serif';
    g.fillText(study.title, W - M, H - 80);
    g.font = '28px "IBM Plex Sans Arabic", sans-serif';
    g.fillStyle = '#cfc6b8';
    g.fillText(`${projectName ? projectName + ' · ' : ''}دراسة كتلة من المسقط · إعداد: جودي · ${new Date().toLocaleDateString('ar-SY')}`, W - M, H - 35);
    g.textAlign = 'left';
    g.fillStyle = '#b5844f';
    g.font = '26px "IBM Plex Sans Arabic", sans-serif';
    g.fillText(est(e) ? 'الأبعاد تقديرية — المقياس غير محدد' : `المقياس مقاس من المسقط · ارتفاع الطابق ${study.floorHeight} م`, M, H - 60);
    // 3D
    const shot = await blobToImage(await api.snapshot(2));
    const box3d = { x: W * 0.42, y: M, w: W * 0.58 - M, h: H - 150 - M * 2 };
    const k3 = Math.min(box3d.w / shot.naturalWidth, box3d.h / shot.naturalHeight);
    g.drawImage(shot, box3d.x + (box3d.w - shot.naturalWidth * k3) / 2, box3d.y + (box3d.h - shot.naturalHeight * k3) / 2, shot.naturalWidth * k3, shot.naturalHeight * k3);
    // left column
    const colW = W * 0.42 - M * 1.5;
    let y = M;
    const place = async (svg: SVGSVGElement | null, label: string, maxH: number) => {
      if (!svg) return;
      const img = await blobToImage(await svgToPng(svg, 2));
      const k = Math.min(colW / img.naturalWidth, maxH / img.naturalHeight);
      g.drawImage(img, M, y + 40, img.naturalWidth * k, img.naturalHeight * k);
      g.fillStyle = '#211f1c'; g.textAlign = 'right'; g.font = 'bold 30px "IBM Plex Sans Arabic", sans-serif';
      g.fillText(label, M + colW, y + 28);
      y += img.naturalHeight * k + 70;
    };
    const avail = H - 150 - M * 2 - (opts.table ? 260 : 0);
    await place(planRef.current, 'مخطط الكتلة', opts.zoning ? avail / 2 - 60 : avail - 60);
    if (opts.zoning) await place(zoneRef.current, 'التنطيق الوظيفي', avail / 2 - 60);
    if (opts.table) {
      g.textAlign = 'right'; g.fillStyle = '#211f1c'; g.font = '26px "IBM Plex Sans Arabic", sans-serif';
      const s = est(e) ? ' *' : '';
      const lines = [
        `البصمة المبنية: ${fmt(metrics.footprintM2, 0)} م²${s}   ·   الأفنية: ${fmt(metrics.courtyardM2, 0)} م²${s}`,
        `المساحة الطابقية: ${fmt(metrics.gfaM2, 0)} م²${s}   ·   أقصى ارتفاع: ${fmt(Math.max(0, ...e.volumes.map((v) => v.z1)), 1)} م`,
        `عدد الفراغات: ${metrics.spaces.filter((x) => x.role !== 'void').length}   ·   الانضغاط: ${fmt(metrics.compactness, 2)}`,
      ];
      lines.forEach((l, i) => g.fillText(l, M + colW, H - 150 - M - 200 + i * 48));
    }
    if (opts.source && e.raster) {
      const r = e.raster.canvas;
      const kk = Math.min(320 / r.width, 220 / r.height);
      g.globalAlpha = 0.9;
      g.drawImage(r, box3d.x, box3d.y, r.width * kk, r.height * kk);
      g.globalAlpha = 1;
      g.strokeStyle = '#cfc3b1'; g.strokeRect(box3d.x, box3d.y, r.width * kk, r.height * kk);
      g.fillStyle = '#6e675d'; g.font = '20px "IBM Plex Sans Arabic", sans-serif'; g.textAlign = 'left';
      g.fillText('المسقط الأصلي', box3d.x, box3d.y + r.height * kk + 26);
    }
    sheet.current = c;
    setPreview(c.toDataURL('image/jpeg', 0.8));
    update((st) => ({ ...st, step: 6 }));
    setBusy(false);
  };

  return (
    <div className="lab-split">
      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        <div className="card tight">
          <Suspense fallback={<div className="viewer3d center muted">…</div>}>
            <Viewer3D volumes={e.volumes} mPerPx={e.scale.mPerPx} center={e.center} colorOf={color} edges floorLines={study.mode !== 'exploded'} floorHeight={study.floorHeight} sun={null} northAngle={e.location.northAngle} onReady={setApi} height={420} />
          </Suspense>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>دوّري النموذج للزاوية التي تريدينها على اللوحة، ثم اضغطي «إنشاء اللوحة».</p>
        </div>
        {preview ? <img src={preview} alt="معاينة لوحة العرض" className="board-preview" /> : <div className="card"><p className="muted small" style={{ margin: 0 }}>ستظهر معاينة اللوحة هنا.</p></div>}
        <div className="offscreen" aria-hidden="true">
          <MassingPlan2D ref={planRef} e={e} colorBy="height" northAngle={e.location.northAngle} floorHeight={study.floorHeight} />
          <MassingPlan2D ref={zoneRef} e={e} colorBy="zone" northAngle={e.location.northAngle} floorHeight={study.floorHeight} />
        </div>
      </div>
      <aside className="stack lab-side" style={{ gap: 14 }}>
        <section className="card stack sm">
          <h3>محتوى اللوحة (A3 أفقي)</h3>
          <label className="check small"><input type="checkbox" checked disabled /><span>منظور الكتلة ثلاثي الأبعاد + مخطط الكتلة</span></label>
          <label className="check small"><input type="checkbox" checked={opts.zoning} onChange={(ev) => setOpts({ ...opts, zoning: ev.target.checked })} /><span>مخطط التنطيق</span></label>
          <label className="check small"><input type="checkbox" checked={opts.table} onChange={(ev) => setOpts({ ...opts, table: ev.target.checked })} /><span>جدول المساحات</span></label>
          <label className="check small"><input type="checkbox" checked={opts.source} onChange={(ev) => setOpts({ ...opts, source: ev.target.checked })} /><span>صورة المسقط الأصلي</span></label>
          <button className="btn primary" disabled={!api || busy} onClick={compose}><Icon name="board" />{busy ? 'جارٍ الإنشاء…' : 'إنشاء اللوحة'}</button>
          {preview && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => sheet.current!.toBlob((b) => downloadBlobAs(b!, `${safeName(study.title)}-board.png`), 'image/png')}><Icon name="image" />PNG</button>
              <button className="btn sm" onClick={async () => downloadBlobAs(await canvasToPdf(sheet.current!), `${safeName(study.title)}-board.pdf`)}><Icon name="pdf" />PDF</button>
              {study.projectId && (
                <button className="btn sm ghost" onClick={async () => {
                  const b = await new Promise<Blob>((r) => sheet.current!.toBlob((x) => r(x!), 'image/png'));
                  await addFile({ projectId: study.projectId!, blob: b, name: `${safeName(study.title)}-board.png`, category: 'diagram', title: `لوحة: ${study.title}` });
                }}><Icon name="upload" />حفظ في المشروع</button>
              )}
            </div>
          )}
        </section>
        <section className="card"><ExportButtons api={api} name={study.title} study={study} /></section>
        <Progress value={study.step / 6} label="تقدم الدراسة" />
      </aside>
    </div>
  );
}

