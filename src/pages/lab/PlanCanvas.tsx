import { useEffect, useMemo, useRef, useState } from 'react';
import type { Engine } from './engine';
import { ZONE_COLORS } from './engine';
import { footprintOutline } from '../../lab/model';
import type { Pt } from '../../lab/trace';

export type Tool = 'select' | 'scale' | 'entrance';
export type Overlay = 'spaces' | 'zones' | 'travel' | 'source';

function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [200, 200, 200];
}

const SPACE_PALETTE = ['#d9c3a5', '#b7c7b9', '#c3c4da', '#e2cfa0', '#d7b9b0', '#bcd3d8', '#d9d0bd', '#c9bfd8', '#cfdcc0', '#e4c7b9'];

export function PlanCanvas({ e, tool, overlay, selected, entrances, scaleRef, travelLimitPx, onPick, onScalePoints, onEntrance }: {
  e: Engine;
  tool: Tool;
  overlay: Overlay;
  selected: number | null;
  entrances: Pt[];
  scaleRef: { a: Pt; b: Pt } | null;
  travelLimitPx: number;
  onPick: (label: number, pt: Pt) => void;
  onScalePoints: (a: Pt, b: Pt) => void;
  onEntrance: (pt: Pt) => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [pending, setPending] = useState<Pt | null>(null);
  const [zoom, setZoom] = useState(1);
  const { ext, res, raster, travel } = e;
  const outline = useMemo(() => (ext ? footprintOutline(ext) : []), [ext]);

  useEffect(() => {
    const c = cv.current;
    if (!c || !raster) return;
    c.width = raster.w;
    c.height = raster.h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = overlay === 'source' ? 1 : 0.5;
    g.drawImage(raster.canvas, 0, 0);
    g.globalAlpha = 1;
    if (ext && res && overlay !== 'source') {
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      const maxT = travelLimitPx;
      for (let i = 0; i < ext.labels.length; i++) {
        const l = ext.labels[i];
        let col: [number, number, number] | null = null;
        let a = 0.55;
        if (overlay === 'travel') {
          if (travel && Number.isFinite(travel[i]) && ext.footprint[i] && !ext.walls[i]) {
            const t = Math.min(1, travel[i] / Math.max(1, maxT));
            col = t >= 1 ? [164, 68, 58] : [Math.round(111 + 120 * t), Math.round(160 - 40 * t), Math.round(120 - 60 * t)];
            a = 0.6;
          } else if (l && res.role[l] !== 'void') { col = [210, 200, 190]; a = 0.35; }
        } else if (l) {
          if (res.role[l] === 'void') { col = [140, 170, 140]; a = 0.35; }
          else if (overlay === 'zones') col = hexToRgb(ZONE_COLORS[res.role[l] === 'circulation' ? 'circulation' : res.zone[l]] ?? '#E8E0D2');
          else col = hexToRgb(SPACE_PALETTE[l % SPACE_PALETTE.length]);
          if (l === selected) { col = [154, 106, 60]; a = 0.7; }
        }
        if (col) {
          const j = i * 4;
          d[j] = d[j] * (1 - a) + col[0] * a;
          d[j + 1] = d[j + 1] * (1 - a) + col[1] * a;
          d[j + 2] = d[j + 2] * (1 - a) + col[2] * a;
        }
      }
      g.putImageData(img, 0, 0);
      // labels
      g.font = `${Math.max(11, Math.round(raster.w / 85))}px "IBM Plex Sans Arabic", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const s of ext.spaces) {
        const [x, y] = s.seed;
        const label = res.role[s.label] === 'void' ? 'فناء' : `${res.name[s.label]}${res.role[s.label] !== 'void' && e.field ? ` · ${e.field[y * ext.w + x]}ط` : ''}`;
        g.fillStyle = 'rgba(255,253,249,.85)';
        const tw = g.measureText(label).width + 10;
        g.fillRect(x - tw / 2, y - 11, tw, 22);
        g.fillStyle = '#211f1c';
        g.fillText(label, x, y);
      }
    }
    // footprint outline
    if (ext && overlay !== 'source') {
      g.strokeStyle = '#9a6a3c';
      g.lineWidth = Math.max(2, raster.w / 400);
      for (const p of outline) for (const r of [p.outer, ...p.holes]) {
        g.beginPath();
        r.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.stroke();
      }
    }
    // scale reference
    const drawRef = (a: Pt, b: Pt | null) => {
      g.strokeStyle = '#a4443a';
      g.fillStyle = '#a4443a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(a[0], a[1], 6, 0, Math.PI * 2);
      g.fill();
      if (b) {
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        g.beginPath();
        g.arc(b[0], b[1], 6, 0, Math.PI * 2);
        g.fill();
      }
    };
    if (scaleRef) drawRef(scaleRef.a, scaleRef.b);
    if (pending) drawRef(pending, null);
    // entrances
    for (const [x, y] of entrances) {
      g.fillStyle = '#211f1c';
      g.beginPath();
      g.arc(x, y, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 13px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('↓', x, y + 1);
    }
  }, [raster, ext, res, overlay, selected, entrances, scaleRef, pending, travel, travelLimitPx, outline, e.field]);

  const toPx = (ev: React.MouseEvent<HTMLCanvasElement>): Pt => {
    const r = ev.currentTarget.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * ev.currentTarget.width, ((ev.clientY - r.top) / r.height) * ev.currentTarget.height];
  };

  return (
    <div className="plan-canvas-wrap">
      <div className="plan-zoom row" style={{ gap: 4 }}>
        {[1, 1.5, 2.5].map((z) => (
          <button key={z} className={`btn sm ${zoom === z ? 'primary' : ''}`} onClick={() => setZoom(z)} type="button">{z === 1 ? 'ملاءمة' : `${z * 100}%`}</button>
        ))}
      </div>
      <div className="plan-scroll">
        <canvas
          ref={cv}
          className={`plan-canvas tool-${tool}`}
          style={{ width: `${zoom * 100}%` }}
          aria-label="المسقط مع الفراغات المكتشفة"
          onClick={(ev) => {
            if (!ext) return;
            const pt = toPx(ev);
            if (tool === 'scale') {
              if (!pending) setPending(pt);
              else { onScalePoints(pending, pt); setPending(null); }
              return;
            }
            if (tool === 'entrance') return onEntrance(pt);
            const xi = Math.round(pt[0]), yi = Math.round(pt[1]);
            const l = ext.labels[yi * ext.w + xi] || 0;
            onPick(l, pt);
          }}
        />
      </div>
    </div>
  );
}
