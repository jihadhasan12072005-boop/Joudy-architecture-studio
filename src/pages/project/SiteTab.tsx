import { useMemo, useState } from 'react';
import type { TabProps } from './ProjectWorkspace';
import type { SiteAnalysis } from '../../db/types';
import { Checklist, ChipEditor, Note, NumField, Stat, TextArea } from '../../components/ui';
import { SunPathDiagram } from '../../components/SunPathDiagram';
import { daySummary, formatHour, localDate, overhangDepth, sunPosition } from '../../lib/sun';
import { fmt } from '../../lib/format';
import { SITE_CHECKS } from '../../data/checklists';
import { TARTOUS } from '../../db/defaults';

export function SiteTab({ project: p, update }: TabProps) {
  const s = p.site;
  const set = <K extends keyof SiteAnalysis>(k: K) => (v: SiteAnalysis[K]) => update((x) => ({ ...x, site: { ...x.site, [k]: v } }));
  const year = new Date().getFullYear();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [day, setDay] = useState(Math.min(28, new Date().getDate()));
  const [hour, setHour] = useState(14);
  const [winH, setWinH] = useState(1.5);

  const summaries = useMemo(
    () => [
      daySummary('21 حزيران (الانقلاب الصيفي)', year, 6, 21, s.latitude, s.longitude, s.utcOffset),
      daySummary('20 آذار (الاعتدال)', year, 3, 20, s.latitude, s.longitude, s.utcOffset),
      daySummary('21 كانون الأول (الانقلاب الشتوي)', year, 12, 21, s.latitude, s.longitude, s.utcOffset),
    ],
    [year, s.latitude, s.longitude, s.utcOffset],
  );
  const pos = sunPosition(localDate(year, month, day, Math.floor(hour), Math.round((hour % 1) * 60), s.utcOffset), s.latitude, s.longitude);
  const summer = summaries[0];
  const winter = summaries[2];
  const depth = overhangDepth(winH, summer.noonAltitude);
  const winterSunlit = Math.max(0, Math.min(1, 1 - (depth * Math.tan((winter.noonAltitude * Math.PI) / 180)) / winH));
  const validCoords = Math.abs(s.latitude) <= 66 && Math.abs(s.longitude) <= 180;

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* SUN */}
      <section className="card">
        <div className="card-head">
          <h3>مسار الشمس — Sun path</h3>
          <span className="badge">حساب فلكي (NOAA) — لا يحتاج إنترنت</span>
        </div>
        <div className="grid split-even">
          <div>
            {validCoords ? (
              <SunPathDiagram
                lat={s.latitude}
                lon={s.longitude}
                utcOffset={s.utcOffset}
                northAngle={s.northAngle}
                year={year}
                marker={pos}
                site={{ w: p.siteWidth, d: p.siteDepth }}
              />
            ) : (
              <Note kind="warn">إحداثيات غير صالحة.</Note>
            )}
          </div>
          <div className="stack">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))' }}>
              <NumField label="خط العرض" unit="°N" value={s.latitude} onChange={set('latitude')} min={-66} max={66} />
              <NumField label="خط الطول" unit="°E" value={s.longitude} onChange={set('longitude')} min={-180} max={180} />
              <NumField label="فرق التوقيت" unit="UTC+" value={s.utcOffset} onChange={set('utcOffset')} min={-12} max={14} hint="سوريا: +3 طوال العام" />
              <NumField label="زاوية الشمال" unit="°" value={s.northAngle} onChange={set('northAngle')} min={-360} max={360} hint="مع عقارب الساعة من أعلى المخطط" />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm ghost" type="button" onClick={() => update((x) => ({ ...x, site: { ...x.site, ...TARTOUS } }))}>طرطوس (افتراضي)</button>
              <span className="tiny faint">الإحداثيات الافتراضية لمركز مدينة طرطوس تقريبياً — عدّليها لموقعك الفعلي.</span>
            </div>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr><th>التاريخ</th><th>الشروق</th><th>الغروب</th><th>ارتفاع الظهر</th><th>سمت الشروق</th></tr>
                </thead>
                <tbody>
                  {summaries.map((d) => (
                    <tr key={d.label}>
                      <td className="small">{d.label}</td>
                      <td className="num">{formatHour(d.sunrise)}</td>
                      <td className="num">{formatHour(d.sunset)}</td>
                      <td className="num">{fmt(d.noonAltitude, 1)}°</td>
                      <td className="num">{d.sunriseAzimuth !== null ? fmt(d.sunriseAzimuth, 0) + '°' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card flat tight" style={{ background: 'var(--ivory)' }}>
              <div className="label" style={{ marginBottom: 8 }}>موقع الشمس في لحظة محددة</div>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                <NumField label="الشهر" value={month} onChange={(v) => setMonth(Math.min(12, Math.max(1, Math.round(v) || 1)))} min={1} max={12} />
                <NumField label="اليوم" value={day} onChange={(v) => setDay(Math.min(31, Math.max(1, Math.round(v) || 1)))} min={1} max={31} />
                <NumField label="الساعة" value={hour} onChange={(v) => setHour(Math.min(23.99, Math.max(0, v)))} min={0} max={24} />
              </div>
              <input type="range" min={5} max={20} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--bronze)' }} aria-label="الساعة" />
              <div className="result" style={{ background: '#fff' }}>
                <Stat k="ارتفاع الشمس" v={<span className="num">{fmt(pos.altitude, 1)}°</span>} />
                <Stat k="السمت (من الشمال)" v={<span className="num">{fmt(pos.azimuth, 0)}°</span>} />
                <Stat k="طول ظل عمود 1 م" v={<span className="num">{pos.altitude > 0 ? fmt(1 / Math.tan((pos.altitude * Math.PI) / 180), 2) : '—'}</span>} unit="m" />
              </div>
            </div>
          </div>
        </div>

        <hr className="divider" />
        <div className="grid split-even">
          <div className="stack sm">
            <div className="label">كاسرة شمس أفقية لنافذة جنوبية (تقدير أولي)</div>
            <NumField label="ارتفاع النافذة (من الجلسة حتى أسفل الكاسرة)" unit="m" value={winH} onChange={setWinH} min={0.1} />
            <p className="tiny muted" style={{ margin: 0 }}>
              عمق الكاسرة = الارتفاع ÷ tan(ارتفاع الشمس). الحساب لواجهة تواجه الجنوب تماماً عند ظهر يوم 21 حزيران، حيث زاوية المقطع (Profile angle) تساوي ارتفاع الشمس. للواجهات الأخرى وساعات أخرى تختلف زاوية المقطع — استعملي مخطط مسار الشمس.
            </p>
          </div>
          <div className="result">
            <Stat k="عمق يظلل النافذة كاملة ظهراً في الصيف" v={<span className="num">{fmt(depth, 2)}</span>} unit="m" />
            <Stat k="نسبة النافذة المشمسة ظهراً في الشتاء بنفس العمق" v={<span className="num">{Math.round(winterSunlit * 100)}%</span>} />
          </div>
        </div>
      </section>

      {/* ANALYSIS */}
      <div className="grid split">
        <section className="card">
          <div className="card-head"><h3>تحليل الموقع</h3></div>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
            <TextArea label="الطبوغرافيا والمناسيب" value={s.topography} onChange={set('topography')} rows={3} />
            <TextArea label="التربة والجيولوجيا (إن توفرت)" value={s.soil} onChange={set('soil')} rows={3} />
            <TextArea label="المناخ والملاحظات المناخية" value={s.climateNotes} onChange={set('climateNotes')} rows={3} placeholder="مناخ متوسطي ساحلي: رطوبة، ملوحة، أمطار شتوية…" />
            <div className="stack sm">
              <TextArea label="الرياح السائدة" value={s.windNotes} onChange={set('windNotes')} rows={3} />
              <input className="input" placeholder="مصدر بيانات الرياح (محطة أرصاد، مرجع…)" value={s.windSource} onChange={(e) => set('windSource')(e.target.value)} aria-label="مصدر بيانات الرياح" />
            </div>
            <TextArea label="نقاط الوصول" value={s.accessPoints} onChange={set('accessPoints')} rows={3} />
            <TextArea label="حركة المشاة" value={s.pedestrianFlow} onChange={set('pedestrianFlow')} rows={3} />
            <TextArea label="حركة السيارات والخدمة" value={s.vehicleFlow} onChange={set('vehicleFlow')} rows={3} />
            <TextArea label="المباني والسياق المحيط" value={s.surroundings} onChange={set('surroundings')} rows={3} />
            <TextArea label="المحددات البيئية" value={s.environmental} onChange={set('environmental')} rows={3} />
            <TextArea label="الإطلالات" value={s.views} onChange={set('views')} rows={3} />
            <TextArea label="الخصوصية" value={s.privacy} onChange={set('privacy')} rows={3} />
            <TextArea label="الضجيج" value={s.noise} onChange={set('noise')} rows={3} />
          </div>
          <div className="note warn" style={{ marginTop: 14 }}>
            <span>⚠</span>
            <div>لا يضع التطبيق بيانات رياح جاهزة لأننا لا نملك بيانات موثقة لموقعك. استعملي بيانات محطة أرصاد قريبة أو مرجعاً منشوراً، واكتبي المصدر.</div>
          </div>
        </section>

        <aside className="stack" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head"><h3>الفرص — Opportunities</h3></div>
            <ChipEditor items={s.opportunities} onChange={set('opportunities')} placeholder="مثال: إطلالة على البحر من الغرب" />
          </section>
          <section className="card">
            <div className="card-head"><h3>المحددات — Constraints</h3></div>
            <ChipEditor items={s.constraints} onChange={set('constraints')} placeholder="مثال: شارع رئيسي مزدحم شمالاً" />
          </section>
          <section className="card">
            <div className="card-head"><h3>قائمة تحقق التحليل</h3><span className="badge num">{SITE_CHECKS.filter((c) => s.checks[c.id]).length}/{SITE_CHECKS.length}</span></div>
            <Checklist items={SITE_CHECKS} state={s.checks} onToggle={(id, v) => set('checks')({ ...s.checks, [id]: v })} />
          </section>
        </aside>
      </div>
    </div>
  );
}
