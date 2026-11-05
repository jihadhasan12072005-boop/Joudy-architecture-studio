import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProject, getBlob, listFiles } from '../../db/repo';
import type { FileMeta, Project } from '../../db/types';
import { useObjectUrl } from '../../lib/hooks';
import { isImage } from '../../lib/image';
import { summarizeProgram, rowArea, STAGES, stageProgress } from '../../lib/program';
import { fmt, fmtDate } from '../../lib/format';
import { REVIEW_CRITERIA } from '../../data/checklists';
import { CATEGORY_LABEL } from '../../components/FileThumb';
import { BrandMark } from '../../components/ArchArt';
import { SunPathDiagram } from '../../components/SunPathDiagram';
import { BubbleDiagram } from '../../components/BubbleDiagram';
import { Icon } from '../../components/Icon';
import { weightedScore } from './ConceptTab';
import { roundAverage } from './ReviewTab';

function FullImage({ f }: { f: FileMeta }) {
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    getBlob(f.id).then(setBlob);
  }, [f.id]);
  const url = useObjectUrl(blob);
  return (
    <figure className="pr-figure">
      {url && <img src={url} alt={f.title} />}
      <figcaption>{f.title} — {CATEGORY_LABEL[f.category]} — النسخة {f.version}</figcaption>
    </figure>
  );
}

export function PrintReport() {
  const { id = '' } = useParams();
  const [p, setP] = useState<Project | null>();
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [withDrawings, setWithDrawings] = useState(true);
  useEffect(() => {
    getProject(id).then((x) => setP(x ?? null));
    listFiles(id).then(setFiles);
  }, [id]);
  if (p === undefined) return null;
  if (p === null) return <div className="page">المشروع غير موجود. <Link to="/projects">رجوع</Link></div>;

  const sum = summarizeProgram(p);
  const sp = stageProgress(p, files.length);
  // latest version of each image sheet
  const latest = new Map<string, FileMeta>();
  for (const f of files) if (isImage(f.mime) && (!latest.get(f.sheetId) || latest.get(f.sheetId)!.version < f.version)) latest.set(f.sheetId, f);
  const images = [...latest.values()].sort((a, b) => a.category.localeCompare(b.category));
  const zoneName = (zid: string) => p.concept.zones.find((z) => z.id === zid)?.name ?? '—';

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <Link to={`/projects/${p.id}/presentation`} className="btn"><Icon name="arrowRight" />رجوع للمشروع</Link>
        <label className="check" style={{ padding: 0 }}><input type="checkbox" checked={withDrawings} onChange={(e) => setWithDrawings(e.target.checked)} /><span>تضمين المخططات</span></label>
        <span className="spacer" />
        <span className="small muted">اختاري «حفظ كـ PDF» كطابعة. الحجم المقترح A4.</span>
        <button className="btn primary" onClick={() => window.print()}><Icon name="print" />طباعة / حفظ PDF</button>
      </div>

      <article className="report">
        <header className="pr-cover">
          <BrandMark className="pr-mark" />
          <div className="eyebrow">Project Report</div>
          <h1>{p.name}</h1>
          <p className="pr-meta">{[p.type, p.location, p.course].filter(Boolean).join(' · ')}</p>
          <p className="pr-meta">إعداد: جودي{p.professor ? ` · بإشراف: ${p.professor}` : ''} · {fmtDate(Date.now())}</p>
          {p.presentation.conceptStatement && <blockquote className="pr-quote">{p.presentation.conceptStatement}</blockquote>}
        </header>

        <section>
          <h2>1. بيانات المشروع</h2>
          <table className="pr-table">
            <tbody>
              <tr><th>مساحة الموقع</th><td>{sum.site ? `${fmt(sum.site, 1)} م²` : '—'}{p.siteWidth && p.siteDepth ? ` (${p.siteWidth} × ${p.siteDepth} م)` : ''}</td></tr>
              <tr><th>عدد الطوابق</th><td>{p.floors}{p.basements ? ` + ${p.basements} قبو` : ''}</td></tr>
              <tr><th>التوجيه</th><td>{p.orientation || '—'}</td></tr>
              <tr><th>موعد التسليم</th><td>{p.deadline ? fmtDate(p.deadline) : '—'}</td></tr>
              <tr><th>تقدم المراحل</th><td>{STAGES.map((s) => `${s.ar} ${Math.round(sp[s.key] * 100)}%`).join(' · ')}</td></tr>
            </tbody>
          </table>
          {p.brief && (<><h3>البرنامج</h3><p className="pre">{p.brief}</p></>)}
          {p.requirements && (<><h3>المتطلبات الوظيفية</h3><p className="pre">{p.requirements}</p></>)}
          {p.constraints && (<><h3>المحددات</h3><p className="pre">{p.constraints}</p></>)}
        </section>

        <section className="pr-break">
          <h2>2. تحليل الموقع</h2>
          <div className="pr-two">
            <div>
              <SunPathDiagram lat={p.site.latitude} lon={p.site.longitude} utcOffset={p.site.utcOffset} northAngle={p.site.northAngle} year={new Date().getFullYear()} site={{ w: p.siteWidth, d: p.siteDepth }} />
              <p className="pr-cap">مسار الشمس — خط العرض {fmt(p.site.latitude, 3)}°، خط الطول {fmt(p.site.longitude, 3)}° (حساب NOAA)</p>
            </div>
            <div>
              {([
                ['الطبوغرافيا', p.site.topography], ['المناخ', p.site.climateNotes], ['الرياح', p.site.windNotes + (p.site.windSource ? ` (المصدر: ${p.site.windSource})` : '')],
                ['الوصول', p.site.accessPoints], ['حركة المشاة', p.site.pedestrianFlow], ['حركة السيارات', p.site.vehicleFlow], ['السياق', p.site.surroundings],
                ['البيئة', p.site.environmental], ['الإطلالات', p.site.views], ['الخصوصية', p.site.privacy], ['الضجيج', p.site.noise],
              ] as [string, string][]).filter(([, v]) => v.trim()).map(([k, v]) => <p key={k}><strong>{k}: </strong>{v}</p>)}
            </div>
          </div>
          <div className="pr-two">
            <div><h3>الفرص</h3><ul>{p.site.opportunities.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
            <div><h3>المحددات</h3><ul>{p.site.constraints.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
          </div>
        </section>

        <section className="pr-break">
          <h2>3. الفكرة</h2>
          {p.concept.statement && <p className="pr-quote">{p.concept.statement}</p>}
          {p.concept.options.map((o) => (
            <div key={o.id} className="pr-option">
              <h3>{o.title} {o.chosen && '— (المعتمد)'} <small>التقييم الموزون: {fmt(weightedScore(o, p.concept.criteria), 2)} / 5</small></h3>
              {o.narrative && <p>{o.narrative}</p>}
              {(o.strengths || o.weaknesses) && <p><strong>قوة:</strong> {o.strengths || '—'} · <strong>ضعف:</strong> {o.weaknesses || '—'}</p>}
            </div>
          ))}
          {p.concept.log.length > 0 && (<><h3>تطور الفكرة</h3><ul>{[...p.concept.log].reverse().map((l) => <li key={l.id}>{fmtDate(l.at)}: {l.text}</li>)}</ul></>)}
        </section>

        {p.program.spaces.length > 0 && (
          <section className="pr-break">
            <h2>4. البرنامج والمساحات</h2>
            <table className="pr-table">
              <thead><tr><th>الفراغ</th><th>النطاق</th><th>الطابق</th><th>العدد</th><th>م²/وحدة</th><th>م²</th></tr></thead>
              <tbody>
                {p.program.spaces.map((r) => (
                  <tr key={r.id}><td>{r.name}</td><td>{zoneName(r.zoneId)}</td><td>{r.floor}</td><td>{r.quantity}</td><td>{fmt(r.unitArea, 1)}</td><td>{fmt(rowArea(r), 1)}</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5}>الصافي</td><td>{fmt(sum.net, 1)}</td></tr>
                <tr><td colSpan={5}>الحركة ({p.program.circulationPct}%) + الجدران ({p.program.wallsPct}%)</td><td>{fmt(sum.circulation + sum.walls, 1)}</td></tr>
                <tr><td colSpan={5}>الإجمالي التقديري — الكفاءة {Math.round(sum.efficiency * 100)}%{sum.site ? ` — FAR ${fmt(sum.far, 2)} — التغطية ${Math.round(sum.coverage * 100)}%` : ''}</td><td>{fmt(sum.gross, 1)}</td></tr>
              </tfoot>
            </table>
            {Object.keys(p.program.adjacency).length > 0 && (
              <div style={{ maxWidth: 560, margin: '12px auto' }}>
                <BubbleDiagram spaces={p.program.spaces.slice(0, 30)} zones={p.concept.zones} adjacency={p.program.adjacency} />
                <p className="pr-cap">مخطط العلاقات الوظيفية</p>
              </div>
            )}
          </section>
        )}

        {p.reviews.length > 0 && (
          <section className="pr-break">
            <h2>5. المراجعات</h2>
            {p.reviews.map((r) => (
              <div key={r.id} className="pr-option">
                <h3>{r.title} — {r.reviewer} — {fmtDate(r.date)} {roundAverage(r) !== null && <small>المعدل {fmt(roundAverage(r)!, 1)} / 5</small>}</h3>
                <table className="pr-table">
                  <tbody>
                    {REVIEW_CRITERIA.filter((c) => r.scores[c.id]?.score || r.scores[c.id]?.notes).map((c) => (
                      <tr key={c.id}><th>{c.ar}</th><td style={{ width: 50 }}>{r.scores[c.id]?.score || '—'}</td><td>{r.scores[c.id]?.notes}</td></tr>
                    ))}
                  </tbody>
                </table>
                {r.summary && <p className="pre">{r.summary}</p>}
                {r.actions.length > 0 && <ul>{r.actions.map((a) => <li key={a.id}>{a.done ? '☑' : '☐'} {a.text}</li>)}</ul>}
              </div>
            ))}
          </section>
        )}

        {(p.presentation.description || p.presentation.boards.length > 0 || p.decisions.length > 0) && (
          <section className="pr-break">
            <h2>6. العرض النهائي</h2>
            {p.presentation.description && (<><h3>الوصف المعماري</h3><p className="pre">{p.presentation.description}</p></>)}
            {p.presentation.boards.length > 0 && (<><h3>تسلسل اللوحات</h3><ol>{p.presentation.boards.map((b) => <li key={b.id}><strong>{b.title}</strong>: {b.contents}</li>)}</ol></>)}
            {p.decisions.length > 0 && (<><h3>القرارات التصميمية</h3><ul>{p.decisions.map((d) => <li key={d.id}><strong>{d.title}</strong>{d.reason ? ` — ${d.reason}` : ''}</li>)}</ul></>)}
            {p.references.length > 0 && (<><h3>المراجع</h3><ul>{p.references.map((r) => <li key={r.id}>{r.title}{r.url ? ` — ${r.url}` : ''}</li>)}</ul></>)}
            {p.presentation.finalNotes && (<><h3>ملاحظات نهائية</h3><p className="pre">{p.presentation.finalNotes}</p></>)}
          </section>
        )}

        {withDrawings && images.length > 0 && (
          <section className="pr-break">
            <h2>المخططات (آخر نسخة من كل مخطط)</h2>
            {images.map((f) => <FullImage key={f.id} f={f} />)}
          </section>
        )}
        <footer className="pr-foot">Joudy Architecture Studio — تقرير مُولَّد من بيانات المشروع. المحتوى الإرشادي العام لا يمثل متطلبات رسمية للجامعة.</footer>
      </article>
    </div>
  );
}
