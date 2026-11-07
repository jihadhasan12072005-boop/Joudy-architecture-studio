import { forwardRef, useMemo } from 'react';
import type { Engine } from './engine';
import { floorColor, ZONE_COLORS, ZONE_LABELS } from './engine';
import { buildVolumes, footprintBBox, type Side } from '../../lab/model';
import { labelPoint, maskToPolygons, polygonArea, type Polygon } from '../../lab/trace';
import { overhangDepth } from '../../lib/sun';
import { fmt } from '../../lib/format';

const ringPath = (r: [number, number][]) => r.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
const polyPath = (p: Polygon) => [p.outer, ...p.holes].map(ringPath).join('');

function niceBar(mPerPx: number, maxPx: number): { m: number; px: number } {
  const target = maxPx * mPerPx;
  const options = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  let m = options[0];
  for (const o of options) if (o <= target) m = o;
  return { m, px: m / mPerPx };
}

function NorthArrow({ x, y, angle, size = 26 }: { x: number; y: number; angle: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <circle r={size} fill="#fff" stroke="#2e2b27" strokeWidth={size / 18} />
      <path d={`M0 ${-size * 0.85} L${size * 0.3} ${size * 0.35} L0 ${size * 0.15} L${-size * 0.3} ${size * 0.35} Z`} fill="#9a6a3c" />
      <text y={-size * 1.15} textAnchor="middle" fontSize={size * 0.6} fill="#2e2b27" transform={`rotate(${-angle} 0 ${-size * 1.15})`}>N</text>
    </g>
  );
}

function ScaleBar({ x, y, mPerPx, maxPx, estimated }: { x: number; y: number; mPerPx: number; maxPx: number; estimated: boolean }) {
  const { m, px } = niceBar(mPerPx, maxPx);
  const fs = Math.max(11, maxPx / 14);
  return (
    <g transform={`translate(${x} ${y})`} fontSize={fs}>
      <rect width={px / 2} height={fs * 0.45} fill="#2e2b27" />
      <rect x={px / 2} width={px / 2} height={fs * 0.45} fill="#fff" stroke="#2e2b27" strokeWidth={1} />
      <text x={0} y={fs * 1.6} fill="#2e2b27">0</text>
      <text x={px} y={fs * 1.6} textAnchor="end" fill="#2e2b27" direction="ltr">{m} m</text>
      {estimated && <text x={px + fs * 0.6} y={fs * 1.6} fill="#a8761d" direction="rtl" textAnchor="start" fontSize={fs * 0.85}>تقديري</text>}
    </g>
  );
}

// ---------------------------------------------------------------------------
export const MassingPlan2D = forwardRef<SVGSVGElement, { e: Engine; colorBy: 'height' | 'zone'; northAngle: number; floorHeight: number; title?: string }>(
  function MassingPlan2D({ e, colorBy, northAngle, floorHeight, title }, ref) {
    const { ext, res, field } = e;
    const data = useMemo(() => {
      if (!ext || !res || !field) return null;
      const vols = buildVolumes(ext, field, 'volumetric', floorHeight);
      const voidMask = new Uint8Array(ext.w * ext.h);
      for (let i = 0; i < voidMask.length; i++) voidMask[i] = ext.labels[i] && res.role[ext.labels[i]] === 'void' ? 1 : 0;
      const voids = maskToPolygons(voidMask, ext.w, ext.h, 1.5, 20);
      const spaces = ext.spaces
        .filter((s) => res.role[s.label] !== 'void')
        .map((s) => {
          const m = new Uint8Array(ext.w * ext.h);
          for (let i = 0; i < m.length; i++) m[i] = ext.labels[i] === s.label ? 1 : 0;
          return { s, polys: maskToPolygons(m, ext.w, ext.h, 1.5, 20) };
        });
      const fpMask = new Uint8Array(ext.w * ext.h);
      for (let i = 0; i < fpMask.length; i++) fpMask[i] = field[i] ? 1 : 0;
      const built = maskToPolygons(fpMask, ext.w, ext.h, 1.5, 20);
      return { vols, voids, spaces, built, bbox: footprintBBox(ext) };
    }, [ext, res, field, floorHeight]);
    if (!data || !ext || !res) return null;
    const [x0, y0, x1, y1] = data.bbox;
    const pad = Math.max(40, (x1 - x0) * 0.08);
    const W = x1 - x0 + pad * 2, H = y1 - y0 + pad * 2 + pad * 0.9;
    const maxF = Math.max(1, ...data.vols.map((v) => v.floors));
    const minF = Math.min(maxF, ...data.vols.map((v) => v.floors));
    const est = e.scale.method === 'estimate';
    const fs = Math.max(13, W / 55);
    const zonesUsed = [...new Set(ext.spaces.filter((s) => res.role[s.label] !== 'void').map((s) => (res.role[s.label] === 'circulation' ? 'circulation' : res.zone[s.label])))];
    return (
      <svg ref={ref} viewBox={`${x0 - pad} ${y0 - pad} ${W} ${H}`} className="diagram lab-diagram" fontFamily="'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif" role="img" aria-label={colorBy === 'height' ? 'مخطط الكتلة ثنائي الأبعاد' : 'مخطط التنطيق الوظيفي'} style={{ background: '#fff' }}>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#6f8a72" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect x={x0 - pad} y={y0 - pad} width={W} height={H} fill="#fff" />
        {colorBy === 'height' ? (
          data.vols.map((v) => v.polys.map((p, i) => <path key={`${v.floors}-${i}`} d={polyPath(p)} fill={floorColor(v.floors, maxF, minF)} fillRule="evenodd" stroke="#2e2b27" strokeWidth={Math.max(1, W / 600)} />))
        ) : (
          <>
            {data.built.map((p, i) => <path key={i} d={polyPath(p)} fill="#3e3a34" fillRule="evenodd" />)}
            {data.spaces.map(({ s, polys }) => polys.map((p, i) => (
              <path key={`${s.label}-${i}`} d={polyPath(p)} fillRule="evenodd" fill={ZONE_COLORS[res.role[s.label] === 'circulation' ? 'circulation' : res.zone[s.label]]} />
            )))}
          </>
        )}
        {data.voids.map((p, i) => <path key={`v${i}`} d={polyPath(p)} fill="url(#hatch)" fillRule="evenodd" stroke="#6f8a72" strokeWidth={1} />)}
        {colorBy === 'height'
          ? data.vols.map((v) => v.polys.filter((p) => polygonArea(p) > (W * W) / 800).map((p, i) => {
              const [lx, ly] = labelPoint(p);
              return (
                <g key={`l${v.floors}-${i}`} fontSize={fs} textAnchor="middle">
                  <text x={lx} y={ly} fill={maxF > minF && (v.floors - minF) / (maxF - minF) > 0.6 ? '#fff' : '#211f1c'} fontWeight={700}>{v.floors} ط</text>
                  <text x={lx} y={ly + fs * 1.1} fontSize={fs * 0.75} fill={maxF > minF && (v.floors - minF) / (maxF - minF) > 0.6 ? '#eee' : '#4a443c'}>+{fmt(v.floors * floorHeight, 1)} م</text>
                </g>
              );
            }))
          : data.spaces.map(({ s }) => (
              <text key={s.label} x={s.seed[0]} y={s.seed[1]} fontSize={fs * 0.85} textAnchor="middle" fill="#211f1c">{res.name[s.label]}</text>
            ))}
        {data.voids.map((p, i) => {
          const [lx, ly] = labelPoint(p);
          return <text key={`vl${i}`} x={lx} y={ly} fontSize={fs} textAnchor="middle" fill="#3f5a43" fontWeight={600}>فناء</text>;
        })}
        <NorthArrow x={x1 + pad * 0.5} y={y0 - pad * 0.35} angle={northAngle} size={Math.max(14, pad * 0.28)} />
        <ScaleBar x={x0} y={y1 + pad * 0.45} mPerPx={e.scale.mPerPx} maxPx={(x1 - x0) / 3} estimated={est} />
        {/* legend */}
        <g transform={`translate(${x1} ${y1 + pad * 0.45})`} fontSize={fs * 0.9} textAnchor="start" direction="rtl">
          {colorBy === 'height'
            ? [...new Set(data.vols.map((v) => v.floors))].map((f, i) => (
                <g key={f} transform={`translate(${-i * fs * 4.6} 0)`}>
                  <rect x={-fs * 1.1} y={0} width={fs} height={fs * 0.7} fill={floorColor(f, maxF, minF)} stroke="#2e2b27" strokeWidth={0.6} />
                  <text x={-fs * 1.4} y={fs * 0.65} fill="#2e2b27">{f} ط</text>
                </g>
              ))
            : zonesUsed.map((z, i) => (
                <g key={z} transform={`translate(${-i * fs * 5.2} 0)`}>
                  <rect x={-fs * 1.1} y={0} width={fs} height={fs * 0.7} fill={ZONE_COLORS[z]} />
                  <text x={-fs * 1.4} y={fs * 0.65} fill="#2e2b27">{ZONE_LABELS[z]}</text>
                </g>
              ))}
        </g>
        {title && <text x={x1} y={y0 - pad * 0.45} fontSize={fs * 1.2} fill="#211f1c" fontWeight={700} textAnchor="end" direction="rtl">{title}</text>}
      </svg>
    );
  },
);

// ---------------------------------------------------------------------------
function stepPath(vals: number[], k: number, toY: (v: number) => number, x0 = 0): string {
  let d = `M${x0} ${toY(0)}`;
  let prev = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v !== prev) { d += `L${x0 + i * k} ${toY(prev)}L${x0 + i * k} ${toY(v)}`; prev = v; }
  }
  d += `L${x0 + vals.length * k} ${toY(prev)}L${x0 + vals.length * k} ${toY(0)}Z`;
  return d;
}

/** Runs of consecutive columns where the profile ≥ level. */
function runs(vals: number[], level: number): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= vals.length; i++) {
    const on = i < vals.length && vals[i] >= level;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push([s, i]); s = -1; }
  }
  return out;
}

export interface FacadeOptions {
  enabled: boolean;
  bayM: number;
  wwr: number; // 0..1
  sillM: number;
  windowHM: number;
  summerNoonAlt: number;
}

export const ElevationSVG = forwardRef<SVGSVGElement, { profile: number[]; mPerPx: number; floorHeight: number; title: string; orientation: 'N' | 'E' | 'S' | 'W'; facade: FacadeOptions; estimated: boolean }>(
  function ElevationSVG({ profile, mPerPx, floorHeight, title, orientation, facade, estimated }, ref) {
    let first = profile.findIndex((v) => v > 0), last = profile.length - 1 - [...profile].reverse().findIndex((v) => v > 0);
    if (first < 0) { first = 0; last = profile.length - 1; }
    const vals = profile.slice(first, last + 1);
    const lenM = vals.length * mPerPx;
    const maxF = Math.max(1, ...vals);
    const S = 1000 / Math.max(lenM, (maxF * floorHeight) * 2.2); // px per m in drawing
    const k = mPerPx * S;
    const Wd = vals.length * k, pad = 50;
    const Hd = maxF * floorHeight * S;
    const toY = (f: number) => pad + Hd - f * floorHeight * S;
    const shading = orientation === 'S' ? 'overhang' : orientation === 'E' || orientation === 'W' ? 'fins' : 'none';
    const depth = overhangDepth(facade.windowHM, facade.summerNoonAlt);
    const windows: JSX.Element[] = [];
    if (facade.enabled) {
      for (let f = 0; f < maxF; f++) {
        for (const [a, b] of runs(vals, f + 1)) {
          const segM = (b - a) * mPerPx;
          const nb = Math.max(1, Math.floor(segM / facade.bayM));
          const bayM = segM / nb;
          const ww = Math.min(bayM - 0.4, (facade.wwr * bayM * floorHeight) / facade.windowHM);
          if (ww <= 0.2) continue;
          for (let j = 0; j < nb; j++) {
            const cx = a * k + (j + 0.5) * bayM * S;
            const x = cx - (ww * S) / 2;
            const yBase = toY(f) - facade.sillM * S;
            const y = yBase - facade.windowHM * S;
            windows.push(<rect key={`${f}-${a}-${j}`} x={x} y={y} width={ww * S} height={facade.windowHM * S} fill="#cfd8de" stroke="#2e2b27" strokeWidth={0.8} />);
            if (shading === 'overhang') windows.push(<rect key={`o${f}-${a}-${j}`} x={x - 0.15 * S} y={y - 0.18 * S} width={(ww + 0.3) * S} height={0.12 * S} fill="#2e2b27" />);
            if (shading === 'fins') for (const fx of [x - 0.1 * S, x + ww * S]) windows.push(<rect key={`fin${f}-${a}-${j}-${fx}`} x={fx} y={y - 0.1 * S} width={0.1 * S} height={(facade.windowHM + 0.2) * S} fill="#2e2b27" />);
          }
        }
      }
    }
    const floorLines: JSX.Element[] = [];
    for (let f = 1; f < maxF; f++) for (const [a, b] of runs(vals, f + 1)) floorLines.push(<line key={`${f}-${a}`} x1={a * k} x2={b * k} y1={toY(f)} y2={toY(f)} stroke="#6e675d" strokeWidth={0.8} strokeDasharray="4 3" />);
    const fs = 14;
    return (
      <svg ref={ref} viewBox={`-30 0 ${Wd + 60} ${Hd + pad + 70}`} className="diagram lab-diagram" role="img" aria-label={title} style={{ background: '#fff' }}>
        <rect x={-30} y={0} width={Wd + 60} height={Hd + pad + 70} fill="#fff" />
        <text x={0} y={22} fontSize={fs + 2} fontWeight={700} fill="#211f1c">{title}</text>
        <path d={stepPath(vals, k, toY)} fill="#f1e5d5" stroke="#2e2b27" strokeWidth={1.6} />
        {floorLines}
        {windows}
        <line x1={-30} x2={Wd + 30} y1={toY(0)} y2={toY(0)} stroke="#211f1c" strokeWidth={2.5} />
        {Array.from({ length: maxF + 1 }, (_, f) => (
          <text key={f} x={-6} y={toY(f) + 4} fontSize={10} textAnchor="end" fill="#6e675d">+{fmt(f * floorHeight, 1)}</text>
        ))}
        <g transform={`translate(0 ${toY(0) + 22})`}>
          <ScaleBar x={0} y={0} mPerPx={1 / S} maxPx={Math.min(Wd / 3, 250)} estimated={estimated} />
        </g>
        {facade.enabled && (
          <text x={Wd} y={toY(0) + 40} fontSize={11} textAnchor="end" fill="#4a443c">
            {shading === 'overhang' ? `كاسرة أفقية ≈ ${fmt(depth, 2)} م تظلل النافذة ظهراً صيفاً` : shading === 'fins' ? 'زعانف عمودية للشمس المنخفضة (شرق/غرب)' : 'واجهة شمالية: إضاءة منتشرة، تظليل غير ضروري'}
          </text>
        )}
      </svg>
    );
  },
);

export const SectionSVG = forwardRef<SVGSVGElement, { cut: number[]; beyond: number[]; inside: boolean[]; mPerPx: number; floorHeight: number; title: string; estimated: boolean }>(
  function SectionSVG({ cut, beyond, inside, mPerPx, floorHeight, title, estimated }, ref) {
    let first = inside.findIndex(Boolean), last = inside.length - 1 - [...inside].reverse().findIndex(Boolean);
    if (first < 0) { first = 0; last = cut.length - 1; }
    const c = cut.slice(first, last + 1), b = beyond.slice(first, last + 1), ins = inside.slice(first, last + 1);
    const maxF = Math.max(1, ...c, ...b);
    const lenM = c.length * mPerPx;
    const S = 1000 / Math.max(lenM, maxF * floorHeight * 2.2);
    const k = mPerPx * S;
    const Wd = c.length * k, pad = 50, Hd = maxF * floorHeight * S;
    const toY = (f: number) => pad + Hd - f * floorHeight * S;
    const slabs: JSX.Element[] = [];
    for (let f = 0; f <= maxF; f++) for (const [a, bb] of runs(c, Math.max(1, f))) if (f <= Math.max(...c.slice(a, bb))) slabs.push(<rect key={`${f}-${a}`} x={a * k} y={toY(f) - 0.25 * S} width={(bb - a) * k} height={0.25 * S} fill="#fff" opacity={f === 0 ? 0 : 0.9} />);
    const courts = runs(ins.map((v, i) => (v && c[i] === 0 ? 1 : 0)), 1);
    return (
      <svg ref={ref} viewBox={`-30 0 ${Wd + 60} ${Hd + pad + 70}`} className="diagram lab-diagram" role="img" aria-label={title} style={{ background: '#fff' }}>
        <rect x={-30} y={0} width={Wd + 60} height={Hd + pad + 70} fill="#fff" />
        <text x={0} y={22} fontSize={16} fontWeight={700} fill="#211f1c">{title}</text>
        <path d={stepPath(b, k, toY)} fill="#ece6dc" stroke="#9a9286" strokeWidth={1} />
        <path d={stepPath(c, k, toY)} fill="#2e2b27" />
        {slabs}
        {courts.map(([a, bb]) => (
          <text key={a} x={((a + bb) / 2) * k} y={toY(0) - 8} fontSize={12} textAnchor="middle" fill="#3f5a43">فناء</text>
        ))}
        <line x1={-30} x2={Wd + 30} y1={toY(0)} y2={toY(0)} stroke="#211f1c" strokeWidth={2.5} />
        {Array.from({ length: maxF + 1 }, (_, f) => <text key={f} x={-6} y={toY(f) + 4} fontSize={10} textAnchor="end" fill="#6e675d">+{fmt(f * floorHeight, 1)}</text>)}
        <g transform={`translate(0 ${toY(0) + 22})`}>
          <ScaleBar x={0} y={0} mPerPx={1 / S} maxPx={Math.min(Wd / 3, 250)} estimated={estimated} />
        </g>
        <text x={Wd} y={toY(0) + 40} fontSize={11} textAnchor="end" fill="#4a443c">أسود: الأجزاء المقطوعة · رمادي فاتح: الكتل خلف خط المقطع</text>
      </svg>
    );
  },
);

export const SIDE_LABEL: Record<Side, string> = { top: 'أعلى المخطط', right: 'يمين المخطط', bottom: 'أسفل المخطط', left: 'يسار المخطط' };
export const DIR_LABEL: Record<'N' | 'E' | 'S' | 'W', string> = { N: 'الشمالية', E: 'الشرقية', S: 'الجنوبية', W: 'الغربية' };
