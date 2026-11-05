import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { getBlob } from '../db/repo';
import type { FileMeta } from '../db/types';
import { useObjectUrl } from '../lib/hooks';
import { isPdf } from '../lib/image';
import { Icon } from './Icon';
import { Segmented } from './ui';

interface View { s: number; x: number; y: number }

function useBlobUrl(id: string | undefined) {
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    let alive = true;
    setBlob(undefined);
    if (id) getBlob(id).then((b) => alive && setBlob(b));
    return () => {
      alive = false;
    };
  }, [id]);
  return { url: useObjectUrl(blob), blob };
}

/** Pan/zoom surface shared by single, side-by-side and swipe modes. */
function Stage({ view, setView, children, label, natural, onFit, swipe, onSwipe }: {
  view: View; setView: (fn: (v: View) => View) => void; children: React.ReactNode; label?: string;
  natural: { w: number; h: number } | null; onFit: (el: HTMLDivElement) => void; swipe?: number; onSwipe?: (x: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number; cx: number; cy: number; vx: number; vy: number } | null>(null);
  const draggingSwipe = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (natural && ref.current) onFit(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural?.w, natural?.h]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const s = Math.min(20, Math.max(0.02, v.s * k));
        const f = s / v.s;
        return { s, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  const down = (e: RPE<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('swipe-handle')) draggingSwipe.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = ref.current!.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, vx: view.x, vy: view.y };
    }
  };
  const move = (e: RPE<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (draggingSwipe.current && onSwipe) {
      const r = ref.current!.getBoundingClientRect();
      onSwipe(Math.min(1, Math.max(0, (cur.x - r.left) / r.width)));
      return;
    }
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const p0 = pinch.current;
      const s = Math.min(20, Math.max(0.02, (p0.s * Math.hypot(a.x - b.x, a.y - b.y)) / p0.d));
      const f = s / p0.s;
      setView(() => ({ s, x: p0.cx - (p0.cx - p0.vx) * f, y: p0.cy - (p0.cy - p0.vy) * f }));
    } else if (pointers.current.size === 1) {
      setView((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }));
    }
  };
  const up = (e: RPE<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      setDragging(false);
      draggingSwipe.current = false;
    }
  };

  return (
    <div ref={ref} className={`viewer-stage ${dragging ? 'dragging' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {label && <span className="viewer-label">{label}</span>}
      {children}
      {swipe !== undefined && <div className="swipe-handle" style={{ left: `${swipe * 100}%` }} />}
    </div>
  );
}

function fitView(el: HTMLElement, n: { w: number; h: number }): View {
  const r = el.getBoundingClientRect();
  const s = Math.min(r.width / n.w, r.height / n.h) * 0.94;
  return { s, x: (r.width - n.w * s) / 2, y: (r.height - n.h * s) / 2 };
}

export function DrawingViewer({ versions, initialId, onClose, actions }: {
  versions: FileMeta[]; // all versions of one sheet, newest first
  initialId: string;
  onClose: () => void;
  actions?: (current: FileMeta) => React.ReactNode;
}) {
  const [curId, setCurId] = useState(initialId);
  const cur = versions.find((v) => v.id === curId) ?? versions[0];
  const others = versions.filter((v) => v.id !== cur.id && !isPdf(v.mime, v.name));
  const [mode, setMode] = useState<'single' | 'side' | 'swipe'>('single');
  const [cmpPick, setCmpId] = useState<string>('');
  // Fall back to the newest other version (versions can be added while the viewer is open).
  const cmpId = others.some((v) => v.id === cmpPick) ? cmpPick : others[0]?.id ?? '';
  const cmp = others.find((v) => v.id === cmpId);
  const a = useBlobUrl(cur.id);
  const b = useBlobUrl(mode !== 'single' ? cmp?.id : undefined);
  const [view, setViewState] = useState<View>({ s: 1, x: 0, y: 0 });
  const setView = useCallback((fn: (v: View) => View) => setViewState(fn), []);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [swipe, setSwipe] = useState(0.5);
  const stageEl = useRef<HTMLDivElement | null>(null);
  const pdf = isPdf(cur.mime, cur.name);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setView((v) => ({ ...v, s: v.s * 1.25 }));
      if (e.key === '-') setView((v) => ({ ...v, s: v.s / 1.25 }));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, setView]);

  useEffect(() => setNatural(null), [cur.id]);

  const zoomBy = (k: number) => {
    const el = stageEl.current?.querySelector('.viewer-stage') as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    const mx = (r?.width ?? 800) / 2, my = (r?.height ?? 600) / 2;
    setView((v) => {
      const s = Math.min(20, Math.max(0.02, v.s * k));
      const f = s / v.s;
      return { s, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f };
    });
  };
  const fit = () => {
    const el = stageEl.current?.querySelector('.viewer-stage') as HTMLElement | null;
    if (el && natural) setViewState(fitView(el, natural));
  };

  const imgStyle = { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` };
  const imgA = a.url && (
    <img src={a.url} alt={cur.title} style={imgStyle} draggable={false} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1200, h: e.currentTarget.naturalHeight || 900 })} />
  );
  const imgB = b.url && <img src={b.url} alt={cmp?.title} style={imgStyle} draggable={false} />;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={cur.title}>
      <div className="viewer-bar">
        <button className="btn sm icon" onClick={onClose} aria-label="إغلاق"><Icon name="close" /></button>
        <strong style={{ marginInline: 6 }}>{cur.title}</strong>
        {versions.length > 1 && (
          <select className="select" value={cur.id} onChange={(e) => setCurId(e.target.value)} aria-label="النسخة">
            {versions.map((v) => <option key={v.id} value={v.id}>النسخة {v.version}{v.id === versions[0].id ? ' (الأحدث)' : ''}</option>)}
          </select>
        )}
        {!pdf && (
          <>
            <button className="btn sm icon" onClick={() => zoomBy(1.25)} aria-label="تكبير"><Icon name="zoomin" /></button>
            <button className="btn sm icon" onClick={() => zoomBy(0.8)} aria-label="تصغير"><Icon name="zoomout" /></button>
            <button className="btn sm icon" onClick={fit} aria-label="ملاءمة"><Icon name="fit" /></button>
            <span className="num tiny" style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(view.s * 100)}%</span>
            {others.length > 0 && (
              <Segmented
                value={mode}
                onChange={(m) => setMode(m)}
                label="وضع العرض"
                options={[
                  { value: 'single', label: 'عرض' },
                  { value: 'side', label: 'جنباً إلى جنب' },
                  { value: 'swipe', label: 'سحب للمقارنة' },
                ]}
              />
            )}
            {mode !== 'single' && (
              <select className="select" value={cmpId} onChange={(e) => setCmpId(e.target.value)} aria-label="قارن مع">
                {others.map((v) => <option key={v.id} value={v.id}>قارن مع النسخة {v.version}</option>)}
              </select>
            )}
          </>
        )}
        <span className="spacer" />
        {actions?.(cur)}
      </div>

      <div ref={stageEl} style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {pdf ? (
          a.url ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <iframe src={a.url} title={cur.title} />
              <div className="viewer-bar" style={{ borderTop: '1px solid #36322c' }}>
                <span className="small">إن لم يظهر الملف (بعض متصفحات الموبايل لا تعرض PDF داخل الصفحة):</span>
                <a className="btn sm" href={a.url} target="_blank" rel="noopener">فتح في نافذة جديدة</a>
              </div>
            </div>
          ) : null
        ) : mode === 'side' && cmp ? (
          <div className="viewer-split" style={{ flex: 1 }}>
            <Stage view={view} setView={setView} natural={natural} onFit={(el) => natural && setViewState(fitView(el, natural))} label={`النسخة ${cur.version}`}>{imgA}</Stage>
            <Stage view={view} setView={setView} natural={null} onFit={() => {}} label={`النسخة ${cmp.version}`}>{imgB}</Stage>
          </div>
        ) : mode === 'swipe' && cmp ? (
          <Stage view={view} setView={setView} natural={natural} onFit={(el) => natural && setViewState(fitView(el, natural))} swipe={swipe} onSwipe={setSwipe}>
            {imgB}
            <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - swipe) * 100}% 0 0)` }}>{imgA}</div>
            <span className="viewer-label">يسار: النسخة {cur.version} · يمين: النسخة {cmp.version}</span>
          </Stage>
        ) : (
          <Stage view={view} setView={setView} natural={natural} onFit={(el) => natural && setViewState(fitView(el, natural))}>{imgA}</Stage>
        )}
      </div>
      {cur.note && <div className="viewer-bar small" style={{ borderTop: '1px solid #36322c' }}>ملاحظة: {cur.note}</div>}
    </div>
  );
}
