import { sunPath, type SunPathPoint } from '../lib/sun';

interface Props {
  lat: number;
  lon: number;
  utcOffset: number;
  northAngle: number; // clockwise from drawing-up to true north
  year: number;
  marker?: { altitude: number; azimuth: number } | null;
  site?: { w: number; d: number } | null;
}

const DATES = [
  { m: 6, d: 21, label: '21 حزيران', color: '#B5844F' },
  { m: 3, d: 20, label: 'الاعتدالان', color: '#6F8A72' },
  { m: 12, d: 21, label: '21 كانون الأول', color: '#5B6C8F' },
];

export function SunPathDiagram({ lat, lon, utcOffset, northAngle, year, marker, site }: Props) {
  const S = 460;
  const c = S / 2;
  const R = 180;
  const toXY = (alt: number, az: number) => {
    const r = (R * (90 - Math.max(0, alt))) / 90;
    const ang = ((az + northAngle) * Math.PI) / 180;
    return [c + r * Math.sin(ang), c - r * Math.cos(ang)] as const;
  };
  const pathD = (pts: SunPathPoint[]) => {
    const vis = pts.filter((p) => p.altitude >= 0);
    return vis.map((p, i) => `${i ? 'L' : 'M'}${toXY(p.altitude, p.azimuth).map((v) => v.toFixed(1)).join(' ')}`).join(' ');
  };
  const paths = DATES.map((dt) => ({ ...dt, pts: sunPath(year, dt.m, dt.d, lat, lon, utcOffset, 10) }));
  const compass = [
    { az: 0, t: 'ش', en: 'N' },
    { az: 90, t: 'ق', en: 'E' },
    { az: 180, t: 'ج', en: 'S' },
    { az: 270, t: 'غ', en: 'W' },
  ];

  // Site rectangle drawn in drawing coordinates (not rotated): shows how the
  // site sits relative to the sun.
  let siteRect: { w: number; h: number } | null = null;
  if (site && site.w > 0 && site.d > 0) {
    const k = 110 / Math.max(site.w, site.d);
    siteRect = { w: site.w * k, h: site.d * k };
  }

  return (
    <figure style={{ margin: 0 }}>
    <svg viewBox={`0 0 ${S} ${S}`} className="diagram" role="img" aria-label="مخطط مسار الشمس">
      <rect width={S} height={S} fill="#fffdf9" />
      {[0, 15, 30, 45, 60, 75].map((a) => (
        <circle key={a} cx={c} cy={c} r={(R * (90 - a)) / 90} fill="none" stroke="#cfc3b1" strokeWidth={a % 30 === 0 ? 1 : 0.5} strokeDasharray={a % 30 === 0 ? undefined : '2 3'} />
      ))}
      {Array.from({ length: 12 }, (_, i) => i * 30).map((az) => {
        const [x, y] = toXY(0, az);
        return <line key={az} x1={c} y1={c} x2={x} y2={y} stroke="#e3dace" strokeWidth={0.7} />;
      })}
      {[30, 60].map((a) => {
        const [x, y] = toXY(a, 180); // label along the true-south spoke
        return (
          <text key={a} x={x + 3} y={y - 3} fontSize="9" fill="#9a9286">{a}°</text>
        );
      })}
      {siteRect && (
        <g>
          <rect x={c - siteRect.w / 2} y={c - siteRect.h / 2} width={siteRect.w} height={siteRect.h} fill="rgba(46,43,39,0.06)" stroke="#2e2b27" strokeWidth="1.2" />
          <text x={c - siteRect.w / 2 + 4} y={c - siteRect.h / 2 + 12} fontSize="9.5" textAnchor="start" fill="#6e675d">الموقع</text>
        </g>
      )}
      {paths.map((p) => (
        <g key={p.label}>
          <path d={pathD(p.pts)} fill="none" stroke={p.color} strokeWidth="2.2" strokeLinecap="round" />
          {p.pts
            .filter((pt) => Number.isInteger(pt.hour) && pt.altitude > 0)
            .map((pt) => {
              const [x, y] = toXY(pt.altitude, pt.azimuth);
              return (
                <g key={pt.hour}>
                  <circle cx={x} cy={y} r="2.6" fill={p.color} />
                  {p.m === 6 && <text x={x} y={y - 6} fontSize="8.5" textAnchor="middle" fill="#6e675d" style={{ direction: 'ltr' }}>{pt.hour}</text>}
                </g>
              );
            })}
        </g>
      ))}
      {marker && marker.altitude > 0 && (() => {
        const [x, y] = toXY(marker.altitude, marker.azimuth);
        return (
          <g>
            <line x1={c} y1={c} x2={x} y2={y} stroke="#a4443a" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x} cy={y} r="7" fill="#a4443a" stroke="#fff" strokeWidth="2" />
          </g>
        );
      })()}
      {compass.map((k) => {
        const ang = ((k.az + northAngle) * Math.PI) / 180;
        const x = c + (R + 18) * Math.sin(ang);
        const y = c - (R + 18) * Math.cos(ang);
        return (
          <g key={k.az}>
            <text x={x} y={y + 5} fontSize="15" fontWeight="700" textAnchor="middle" fill={k.az === 0 ? '#9a6a3c' : '#2e2b27'}>{k.t}</text>
            <text x={x} y={y + 17} fontSize="8.5" textAnchor="middle" fill="#9a9286">{k.en}</text>
          </g>
        );
      })}
    </svg>
      <figcaption className="legend">
        {DATES.map((d) => <span key={d.label}><i style={{ background: d.color }} />{d.label}</span>)}
        <span>الأرقام = الساعة المحلية (صيفاً)</span>
      </figcaption>
    </figure>
  );
}
