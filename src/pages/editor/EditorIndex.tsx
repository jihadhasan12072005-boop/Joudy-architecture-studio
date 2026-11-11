import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteModel, getSettings, listModels, putBlob, saveModel } from '../../db/repo';
import { useLive } from '../../lib/hooks';
import { uid } from '../../lib/id';
import { relTime } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Empty, Note, useConfirm, useToast } from '../../components/ui';
import { newModel, parseModelFile, sampleMasses, type EditorModel } from '../../editor/model';
import { drawSamplePlan } from '../../lab/io';

export async function createSampleModel(): Promise<EditorModel> {
  const m = newModel('مثال — مكتبة بفناء');
  const blob = await drawSamplePlan(); // 1400 × 1000 px, 30 px = 1 m, building origin at (160, 140) px
  const blobId = uid();
  await putBlob(blobId, blob);
  m.reference = { blobId, mime: 'image/png', name: 'مسقط المثال.png', widthM: 1400 / 30, aspect: 1000 / 1400, x: (700 - 160) / 30, z: (500 - 140) / 30, rot: 0, opacity: 0.55, locked: true, visible: true };
  m.measured = true;
  m.scaleNote = 'مثال: المقياس معروف من خط الأبعاد المكتوب على المسقط (36.00 م).';
  m.masses = sampleMasses();
  await saveModel(m);
  return m;
}

export function EditorIndex() {
  const models = useLive(listModels) ?? [];
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const jsonInput = useRef<HTMLInputElement>(null);

  const create = async () => {
    const m = newModel('نموذج كتل جديد', (await getSettings()).currentProjectId);
    await saveModel(m);
    nav(`/editor/${m.id}`);
  };
  const sample = async () => {
    setBusy(true);
    try { nav(`/editor/${(await createSampleModel()).id}`); } finally { setBusy(false); }
  };
  const importFile = async (f: File) => {
    try {
      const data = parseModelFile(await f.text());
      const m: EditorModel = { ...data.model, id: 'em' + uid().replace(/-/g, '').slice(0, 10), updatedAt: Date.now(), versions: data.model.versions ?? [] };
      if (data.referenceImage && m.reference) {
        const blob = await (await fetch(data.referenceImage)).blob();
        const blobId = uid();
        await putBlob(blobId, blob);
        m.reference = { ...m.reference, blobId };
      } else m.reference = null;
      await saveModel(m);
      toast(`فُتح «${m.title}» للتعديل`);
      nav(`/editor/${m.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <section className="lab-hero">
        <div className="stack" style={{ gap: 14 }}>
          <div className="eyebrow">Massing Editor — محرر الكتل</div>
          <h1>صمّمي الكتل بنفسك، فوق مسقطك</h1>
          <p className="lead">ارسمي حدود الكتل فوق صورة المسقط، حوّليها إلى مجسمات حقيقية، ثم عدّلي أبعادها وارتفاعاتها وحدودها وانحناءاتها وأسقفها — كما تتخيلينها أنت.</p>
          <ol className="editor-flow">
            {['ارفعي المسقط', 'اضبطي المقياس إذا عندك قياس معروف', 'ارسمي حدود الكتل', 'حددي الارتفاعات', 'عدّلي الشكل والأسقف', 'احفظي وصدّري'].map((t, i) => <li key={t}><span>{i + 1}</span>{t}</li>)}
          </ol>
          <div className="row">
            <button className="btn bronze lab-cta" onClick={create}><Icon name="plus" />نموذج جديد</button>
            <button className="btn" onClick={sample} disabled={busy}><Icon name="spark" />جرّبي المثال الجاهز</button>
            <button className="btn ghost" onClick={() => jsonInput.current?.click()}><Icon name="upload" />فتح ملف مشروع محفوظ</button>
            <input ref={jsonInput} type="file" hidden accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          </div>
          <span className="tiny muted">مصمَّم للابتوب مع فأرة ولوحة مفاتيح. على الموبايل يمكن المعاينة، لكن الرسم الدقيق أسهل على الحاسوب.</span>
        </div>
        <div className="lab-hero-art" aria-hidden="true">
          <svg viewBox="0 0 420 280" className="diagram">
            <rect x="30" y="40" width="190" height="130" fill="#fff" stroke="#cfc3b1" strokeDasharray="5 4" />
            <path d="M50 60h110v40h40v50H50z" fill="rgba(181,132,79,.18)" stroke="#9a6a3c" strokeWidth="2.5" />
            {[[50, 60], [160, 60], [160, 100], [200, 100], [200, 150], [50, 150]].map(([x, y]) => <rect key={`${x}${y}`} x={x - 4} y={y - 4} width="8" height="8" fill="#fff" stroke="#2e2b27" />)}
            <path d="M240 105h40" stroke="#9a6a3c" strokeWidth="3" /><path d="M272 97l8 8-8 8" stroke="#9a6a3c" strokeWidth="3" fill="none" />
            <g transform="translate(290 40)">
              <path d="M0 160l70-35 50 25-70 35z" fill="#efe3d0" stroke="#2e2b27" />
              <path d="M0 160V90l70-35v70zM70 125V55l50 25v70z" fill="#d9c3a5" stroke="#2e2b27" />
              <path d="M0 90l70-35 50 25q-10-40-60-55-40 20-60 65z" fill="#c9a27a" stroke="#2e2b27" />
            </g>
          </svg>
        </div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 12 }}>نماذجك</h2>
        {models.length === 0 ? (
          <div className="card"><Empty icon="cube" title="لا نماذج بعد">ابدئي نموذجاً جديداً أو جرّبي المثال الجاهز.</Empty></div>
        ) : (
          <div className="list card">
            {models.map((m) => (
              <div key={m.id} className="list-item">
                <Icon name="cube" size={18} />
                <Link to={`/editor/${m.id}`} style={{ flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ fontWeight: 500 }}>{m.title}</div>
                  <div className="tiny muted">{m.masses.length} كتل · {m.versions.length} نسخ محفوظة · {relTime(m.updatedAt)} · {m.measured ? 'مقاس' : 'أبعاد تقريبية'}</div>
                </Link>
                <Link to={`/editor/${m.id}`} className="btn sm">فتح</Link>
                <button className="btn ghost icon sm" aria-label={`حذف ${m.title}`} onClick={async () => { if (await confirm({ title: `حذف «${m.title}»؟`, confirm: 'حذف', danger: true })) await deleteModel(m.id); }}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <Note kind="info">
          الكتل هنا عناصر هندسية حقيقية (وليست صوراً): تُحفظ تلقائياً على جهازك، وتُصدَّر كنموذج GLB لبرامج التصميم، وكملف مشروع (.json) تعيدين فتحه للتعديل. يمكنك أيضاً فتح أي دراسة من «مختبر الكتلة» هنا لتعديلها يدوياً.
        </Note>
      </section>
    </div>
  );
}
