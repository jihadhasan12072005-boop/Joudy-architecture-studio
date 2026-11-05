import type { TabProps } from './ProjectWorkspace';
import type { Project } from '../../db/types';
import { NumField, TextArea, TextField, Stat, Note } from '../../components/ui';
import { siteArea } from '../../lib/program';
import { fmt } from '../../lib/format';
import { PROJECT_TYPES } from '../Projects';
import { Link } from 'react-router-dom';

export function OverviewTab({ project: p, update }: TabProps) {
  const set = <K extends keyof Project>(k: K) => (v: Project[K]) => update((x) => ({ ...x, [k]: v }));
  const area = siteArea(p);
  return (
    <div className="grid split">
      <div className="stack" style={{ gap: 18 }}>
        <section className="card">
          <div className="card-head"><h3>بيانات المشروع</h3></div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ptype2">نوع المشروع</label>
              <input id="ptype2" className="input" list="ptypes" value={p.type} onChange={(e) => set('type')(e.target.value)} />
              <datalist id="ptypes">{PROJECT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <TextField label="المقرر" value={p.course} onChange={set('course')} />
            <TextField label="الأستاذ / المشرف" value={p.professor} onChange={set('professor')} />
            <TextField label="موعد التسليم النهائي" type="date" value={p.deadline} onChange={set('deadline')} />
            <NumField label="عدد الطوابق فوق الأرض" value={p.floors} onChange={(v) => set('floors')(Math.max(0, Math.round(v)))} min={0} />
            <NumField label="عدد الأقبية" value={p.basements} onChange={(v) => set('basements')(Math.max(0, Math.round(v)))} min={0} />
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>الموقع</h3></div>
          <div className="form-grid">
            <TextField label="العنوان / الموقع" value={p.location} onChange={set('location')} className="span-2" />
            <TextField label="التوجيه العام" value={p.orientation} onChange={set('orientation')} placeholder="مثال: الواجهة الطويلة نحو الجنوب الغربي" />
            <NumField label="عرض الموقع" unit="m" value={p.siteWidth} onChange={set('siteWidth')} min={0} allowEmpty />
            <NumField label="عمق الموقع" unit="m" value={p.siteDepth} onChange={set('siteDepth')} min={0} allowEmpty />
            <NumField label="مساحة فعلية (للموقع غير المنتظم)" unit="m²" value={p.siteAreaOverride} onChange={set('siteAreaOverride')} min={0} allowEmpty hint="اتركيها فارغة لحساب العرض × العمق. استعملي حاسبة المساحات للمضلعات." />
            <TextArea className="span-all" label="وصف الموقع" value={p.siteDescription} onChange={set('siteDescription')} rows={3} />
          </div>
          <div className="result" style={{ marginTop: 14 }}>
            <Stat k="مساحة الموقع المعتمدة" v={<span className="num">{area > 0 ? fmt(area, 1) : '—'}</span>} unit="m²" />
            <Stat k="بالدونم" v={<span className="num">{area > 0 ? fmt(area / 1000, 3) : '—'}</span>} />
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>برنامج الأستاذ والمتطلبات</h3></div>
          <div className="stack">
            <TextArea label="نص البرنامج (Project brief)" value={p.brief} onChange={set('brief')} rows={7} placeholder="انسخي هنا نص البرنامج كما أعطاه الأستاذ — ويمكنك رفع ملف البرنامج PDF من تبويب المخططات." />
            <TextArea label="المتطلبات الوظيفية" value={p.requirements} onChange={set('requirements')} rows={5} placeholder="الفراغات المطلوبة، أعداد المستخدمين، المساحات المحددة…" />
            <TextArea label="المحددات التصميمية" value={p.constraints} onChange={set('constraints')} rows={4} placeholder="ارتفاعات مسموحة، وجائب، ميزانية، مواد مفروضة، أشجار يجب الحفاظ عليها…" />
          </div>
        </section>
      </div>

      <aside className="stack" style={{ gap: 18 }}>
        <section className="card">
          <h3 style={{ marginBottom: 10 }}>من أين أبدأ؟</h3>
          <ol className="small" style={{ paddingInlineStart: 20, margin: 0, lineHeight: 2 }}>
            <li>انسخي البرنامج وحددي أبعاد الموقع هنا.</li>
            <li><Link to={`/projects/${p.id}/site`}>حلّلي الموقع</Link> وحددي اتجاه الشمال لرسم مسار الشمس.</li>
            <li><Link to={`/projects/${p.id}/program`}>حوّلي المتطلبات إلى جدول فراغات</Link>.</li>
            <li><Link to={`/projects/${p.id}/concept`}>اقترحي فكرتين أو ثلاثاً وقارنيها</Link>.</li>
            <li><Link to={`/projects/${p.id}/drawings`}>ارفعي كل نسخة من مخططاتك</Link>.</li>
          </ol>
        </section>
        <Note kind="bronze">
          كل المحتوى العام في الاستوديو (القوائم والمعايير) هو إرشاد أكاديمي عام وليس متطلبات رسمية لجامعة طرطوس. برنامج أستاذك هو المرجع دائماً.
        </Note>
      </aside>
    </div>
  );
}
