import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getBlob, getModel, putBlob, saveModel, deleteModel } from '../../db/repo';
import { useAutosave } from '../../lib/hooks';
import { uid } from '../../lib/id';
import { fmt, fmtDateTime } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Modal, Note, NumField, SaveIndicator, Segmented, useConfirm, useToast } from '../../components/ui';
import { MassEditorEngine, type Tool, type View } from '../../editor/engine';
import {
  bbox, duplicateMass, insertVertex, massArea, mergeMasses, removeVertex, ROOF_LABELS, setMassSize, MASS_COLORS, type Mass, type RoofType, type V2,
} from '../../editor/geom';
import { FILE_FORMAT, FILE_VERSION, scaleModel, snapshotOf, type EditorModel, type ModelSnapshot, type RefImage } from '../../editor/model';
import { renderPdfPage, safeName, isPdfBlob, pdfWithPreview, blobToCanvas } from '../../lab/io';
import { ExportPreview, type ExportKind, type ExportResult } from '../../components/ExportPreview';
import { checkImageBlob, ExportError } from '../../lib/exportGuard';

const TOOLS: { key: Tool; label: string; icon: string; key2: string; help: string }[] = [
  { key: 'select', label: 'تحديد وتحريك', icon: 'target', key2: 'V', help: 'حددي كتلة واسحبيها، غيّري أبعادها بالمربعات، ودوّريها بالدائرة.' },
  { key: 'rect', label: 'مستطيل', icon: 'grid', key2: 'R', help: 'ارسمي كتلة مستطيلة بالسحب.' },
  { key: 'poly', label: 'شكل حر', icon: 'edit', key2: 'P', help: 'ارسمي حدود كتلة غير منتظمة نقطة بنقطة.' },
  { key: 'edit', label: 'تعديل الحدود', icon: 'bubbles', key2: 'E', help: 'حرّكي نقاط الكتلة وقوّسي أضلاعها.' },
  { key: 'void', label: 'فراغ', icon: 'layers', key2: 'H', help: 'اقتطعي فناءً أو تجويفاً من كتلة — فقط حيث تريدين.' },
  { key: 'scale', label: 'المقياس', icon: 'ruler', key2: 'S', help: 'انقري طرفي بُعد معروف في المسقط وأدخلي طوله.' },
  { key: 'image', label: 'تحريك الصورة', icon: 'image', key2: 'I', help: 'اسحبي صورة المسقط لضبط موضعها.' },
];

const VIEWS: { value: View; label: string }[] = [
  { value: 'plan', label: 'مسقط علوي' },
  { value: '3d', label: 'منظور 3D' },
  { value: 'S', label: 'واجهة جنوبية' },
  { value: 'N', label: 'شمالية' },
  { value: 'E', label: 'شرقية' },
  { value: 'W', label: 'غربية' },
];

const STEPS = [
  { n: 1, t: 'ارفعي المسقط' },
  { n: 2, t: 'اضبطي المقياس' },
  { n: 3, t: 'ارسمي حدود الكتل' },
  { n: 4, t: 'حددي الارتفاعات' },
  { n: 5, t: 'عدّلي الشكل والأسقف' },
  { n: 6, t: 'احفظي وصدّري' },
];

interface HistItem { snap: ModelSnapshot; label: string; key: string; at: number }

export function EditorPage() {
  const { id = '' } = useParams();
  const [model, setModel] = useState<EditorModel | null | undefined>(undefined);
  const [selection, setSelection] = useState<string[]>([]);
  const [vertex, setVertex] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [view, setView] = useState<View>('plan');
  const [snap, setSnap] = useState(true);
  const [gridStep, setGridStep] = useState(0.5);
  const [floorLines, setFloorLines] = useState(true);
  const [hint, setHint] = useState('');
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [scaleAsk, setScaleAsk] = useState<{ a: V2; b: V2 } | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const [exp, setExp] = useState<ExportKind | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<MassEditorEngine | null>(null);
  const past = useRef<HistItem[]>([]);
  const future = useRef<HistItem[]>([]);
  const [histTick, setHistTick] = useState(0);
  const { schedule, saving, flush } = useAutosave<EditorModel>(saveModel, 600);
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    getModel(id).then((m) => {
      setModel(m ?? null);
      if (m) past.current = [{ snap: snapshotOf(m), label: 'فتح', key: 'open', at: Date.now() }];
    });
  }, [id]);

  const refBlobId = model?.reference?.blobId;
  useEffect(() => {
    let url: string | null = null;
    if (refBlobId) getBlob(refBlobId).then((b) => { if (b) { url = URL.createObjectURL(b); setRefUrl(url); } });
    else setRefUrl(null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [refBlobId]);

  // ---------------------------------------------------------------- history & persistence
  const commit = useCallback((next: EditorModel, label: string, key = label) => {
    setModel(next);
    schedule(next);
    const now = Date.now();
    const top = past.current[past.current.length - 1];
    const item = { snap: snapshotOf(next), label, key, at: now };
    if (top && top.key === key && key.startsWith('field:') && now - top.at < 1200) past.current[past.current.length - 1] = item;
    else past.current.push(item);
    if (past.current.length > 150) past.current.shift();
    future.current = [];
    setHistTick((t) => t + 1);
  }, [schedule]);

  const live = useCallback((next: EditorModel) => setModel(next), []);

  const restore = (snap: ModelSnapshot) => {
    setModel((m) => {
      if (!m) return m;
      const next = { ...m, ...structuredClone(snap) };
      schedule(next);
      return next;
    });
    setSelection((s) => s.filter((id2) => snap.masses.some((x) => x.id === id2)));
    setVertex(null);
  };
  const undo = () => {
    if (past.current.length < 2) return;
    const cur = past.current.pop()!;
    future.current.push(cur);
    restore(past.current[past.current.length - 1].snap);
    setHint(`تراجع: ${cur.label}`);
    setHistTick((t) => t + 1);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(nxt);
    restore(nxt.snap);
    setHint(`إعادة: ${nxt.label}`);
    setHistTick((t) => t + 1);
  };

  // ---------------------------------------------------------------- engine
  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => {
    if (!model || !host.current || engine.current) return;
    engine.current = new MassEditorEngine(host.current, {
      onChange: (m, isCommit, label) => (isCommit ? commit({ ...modelRef.current!, ...m, title: modelRef.current!.title }, label) : live({ ...modelRef.current!, ...m, title: modelRef.current!.title })),
      onSelect: (ids, v) => { setSelection(ids); setVertex(v); },
      onHint: setHint,
      onScalePoints: (a, b) => setScaleAsk({ a, b }),
      onNeedPlanView: () => { setView('plan'); setHint('أدوات الرسم تعمل في المسقط العلوي — انتقلنا إليه.'); },
    }, { model, selection, vertex, tool, view, snap, gridStep, floorLines, refUrl });
    (window as unknown as { __massEditor?: MassEditorEngine }).__massEditor = engine.current;
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model === null || model === undefined]);

  useEffect(() => {
    if (model && engine.current) engine.current.setState({ model, selection, vertex, tool, view, snap, gridStep, floorLines, refUrl });
  }, [model, selection, vertex, tool, view, snap, gridStep, floorLines, refUrl]);

  // ---------------------------------------------------------------- derived
  const sel = useMemo(() => (model ? model.masses.filter((m) => selection.includes(m.id)) : []), [model, selection]);
  const one = sel.length === 1 ? sel[0] : null;

  const setMass = (m: Mass, label: string, field?: string) => {
    if (!model) return;
    commit({ ...model, masses: model.masses.map((x) => (x.id === m.id ? m : x)) }, label, field ? `field:${m.id}:${field}` : label);
  };
  const setRef = (r: RefImage | null, label: string, field?: string) => model && commit({ ...model, reference: r }, label, field ? `field:ref:${field}` : label);

  const removeSelected = () => {
    if (!model || !selection.length) return;
    commit({ ...model, masses: model.masses.filter((m) => !selection.includes(m.id)) }, 'حذف');
    setSelection([]);
  };
  const duplicateSelected = () => {
    if (!model || !sel.length) return;
    const copies = sel.map((m) => duplicateMass(m));
    commit({ ...model, masses: [...model.masses, ...copies] }, 'نسخ');
    setSelection(copies.map((c) => c.id));
  };
  const mergeSelected = () => {
    if (!model || sel.length < 2) return;
    const merged = mergeMasses(sel);
    if (!merged) return toast('لا يمكن الدمج: الكتل غير متلامسة. حرّكي إحداها لتلامس الأخرى أو ارسمي كتلة رابطة بينهما ثم ادمجي.', 'error');
    const firstIdx = model.masses.findIndex((m) => selection.includes(m.id));
    const rest = model.masses.filter((m) => !selection.includes(m.id));
    rest.splice(firstIdx, 0, merged);
    commit({ ...model, masses: rest }, 'دمج');
    setSelection([merged.id]);
  };
  const nudge = (dx: number, dz: number) => {
    if (!model || !sel.length) return;
    commit({ ...model, masses: model.masses.map((m) => (selection.includes(m.id) ? { ...m, x: m.x + dx, z: m.z + dz } : m)) }, 'تحريك بالأسهم', 'field:nudge');
  };
  const rotateSel = (deg: number) => {
    if (!model || !sel.length) return;
    commit({ ...model, masses: model.masses.map((m) => (selection.includes(m.id) ? { ...m, rot: (((m.rot + deg) % 360) + 360) % 360 } : m)) }, 'تدوير', 'field:rotkey');
  };

  // ---------------------------------------------------------------- keyboard (Windows laptop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (ctrl && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (ctrl && k === 's') { e.preventDefault(); void saveVersion(); return; }
      if (ctrl) return;
      if (e.key === 'Enter') { engine.current?.closeDraft(); return; }
      if (e.key === 'Escape') { engine.current?.cancelDraft(); if (tool === 'select') setSelection([]); return; }
      if (e.key === 'Backspace' && (tool === 'poly' || tool === 'void')) { e.preventDefault(); engine.current?.undoPoint(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (tool === 'edit' && one && vertex !== null) { setMass(removeVertex(one, vertex), 'حذف نقطة'); setVertex(null); }
        else removeSelected();
        return;
      }
      const step = e.shiftKey ? 1 : 0.1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); return; }
      if (e.key === '[') { rotateSel(e.shiftKey ? -15 : -5); return; }
      if (e.key === ']') { rotateSel(e.shiftKey ? 15 : 5); return; }
      const toolKey = TOOLS.find((x) => x.key2.toLowerCase() === k);
      if (toolKey) { setTool(toolKey.key); if (['rect', 'poly', 'void', 'scale', 'image'].includes(toolKey.key)) setView('plan'); return; }
      if (k === '1') setView('plan');
      if (k === '2') setView('3d');
      if (k === '3') setView('S');
      if (k === 'f') engine.current?.fit();
      if (k === 'm' && selection.length > 1) mergeSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- reference image
  const uploadReference = async (f: File) => {
    if (!model) return;
    let blob: Blob = f, mime = f.type, name = f.name;
    if (isPdfBlob(f.type, f.name)) {
      const { canvas } = await renderPdfPage(f, 1, 2400);
      blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      mime = 'image/png';
      name = f.name.replace(/\.pdf$/i, '') + ' (صفحة 1).png';
    }
    if (!mime.startsWith('image/')) return toast('اختاري صورة (PNG/JPG) أو PDF.', 'error');
    const bmp = await createImageBitmap(blob);
    const aspect = bmp.height / bmp.width;
    bmp.close();
    const blobId = uid();
    await putBlob(blobId, blob);
    const widthM = 40;
    commit({
      ...model,
      reference: { blobId, mime, name, widthM, aspect, x: widthM / 2, z: (widthM * aspect) / 2, rot: 0, opacity: 0.6, locked: true, visible: true },
      measured: false,
      scaleNote: 'افتراض: عرض الصورة 40 م — حددي المقياس للحصول على أبعاد مقاسة.',
    }, 'رفع صورة المسقط');
    setView('plan');
    setTimeout(() => engine.current?.fit(), 50);
    toast('رُفعت صورة المسقط. الخطوة التالية: اضبطي المقياس إن كان عندك بُعد معروف.');
  };

  const applyScale = (meters: number) => {
    if (!model || !scaleAsk) return;
    const d = Math.hypot(scaleAsk.b[0] - scaleAsk.a[0], scaleAsk.b[1] - scaleAsk.a[1]);
    if (!(d > 0) || !(meters > 0)) return;
    const k = meters / d;
    const scaled = scaleModel(model, k);
    commit({ ...model, ...scaled, measured: true, scaleNote: `مقاس: بُعد مرجعي ${fmt(meters, 2)} م` }, 'ضبط المقياس');
    setScaleAsk(null);
    setTool('select');
    setTimeout(() => engine.current?.fit(), 50);
    toast(`ضُبط المقياس (معامل ${fmt(k, 3)}). كل الأبعاد الآن مقاسة.`);
  };

  // ---------------------------------------------------------------- versions & export
  const saveVersion = async () => {
    if (!model) return;
    const name = `نسخة ${model.versions.length + 1} — ${fmtDateTime(Date.now())}`;
    const next = { ...model, versions: [{ id: uid(), name, at: Date.now(), snapshot: snapshotOf(model) }, ...model.versions].slice(0, 40) };
    setModel(next);
    await flush();
    await saveModel(next);
    toast(`حُفظت «${name}»`);
  };

  const buildExport = async (kind: ExportKind): Promise<ExportResult> => {
    if (!engine.current || !model) throw new ExportError('المحرر لم يجهز بعد.');
    if (kind === 'png') return { blob: await engine.current.snapshotPng(2), filename: `${safeName(model.title)}-${view}.png`, note: model.measured ? '' : 'الأبعاد في هذا التصميم تقريبية.' };
    if (kind === 'pdf') {
      const shot = await engine.current.snapshotPng(2);
      await checkImageBlob(shot);
      const { blob, preview } = await pdfWithPreview(await blobToCanvas(shot));
      return { blob, preview, filename: `${safeName(model.title)}-${view}.pdf` };
    }
    if (kind === 'glb') return { blob: await engine.current.exportGLB(), preview: await engine.current.snapshotPng(1), filename: `${safeName(model.title)}.glb` };
    let referenceImage: string | null = null;
    if (model.reference) {
      const b = await getBlob(model.reference.blobId);
      if (b) referenceImage = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b); });
    }
    const file = { format: FILE_FORMAT, version: FILE_VERSION, savedAt: new Date().toISOString(), model: { ...model, versions: [] }, referenceImage };
    const preview = model.masses.length ? await engine.current.snapshotPng(1) : undefined;
    return { blob: new Blob([JSON.stringify(file)], { type: 'application/json' }), preview, filename: `${safeName(model.title)}.joudy-massing.json`, note: `${model.masses.length} كتل${model.reference ? ' + صورة المسقط' : ''}.` };
  };

  // ---------------------------------------------------------------- render
  if (model === undefined) return <div className="page" />;
  if (model === null) return <div className="page"><Note kind="warn">النموذج غير موجود. <Link to="/editor">العودة إلى محرر الكتل</Link></Note></div>;

  const approx = !model.measured;
  const unit = approx ? 'm ≈' : 'm';
  const done = [
    !!model.reference || model.masses.length > 0,
    model.measured,
    model.masses.length > 0,
    model.masses.some((m) => m.height !== 6.4 || m.base !== 0),
    model.masses.some((m) => m.roof.type !== 'flat' || m.radius.some((r) => r > 0) || m.bulge.some((b) => b !== 0) || m.holes.length > 0 || m.outline.length !== 4),
    exported || model.versions.length > 0,
  ];
  const step = done.findIndex((d) => !d) + 1 || 7;
  const totalArea = model.masses.reduce((a, m) => a + massArea(m), 0);
  const gfa = model.masses.reduce((a, m) => a + massArea(m) * Math.max(1, Math.round(m.height / Math.max(0.5, m.floorHeight))), 0);
  void histTick;

  return (
    <div className="page editor-page">
      <div className="editor-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row small muted" style={{ gap: 6 }}>
            <Link to="/editor" style={{ color: 'inherit' }}>محرر الكتل</Link><span>/</span><SaveIndicator saving={saving} />
            {approx ? <span className="badge warn">الأبعاد تقريبية — لم يُضبط المقياس</span> : <span className="badge sage">الأبعاد مقاسة</span>}
          </div>
          <input className="display editor-title" aria-label="اسم النموذج" value={model.title} onChange={(e) => { const n = { ...model, title: e.target.value }; setModel(n); schedule(n); }} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setHelpOpen(true)}><Icon name="info" />شرح الأدوات</button>
          <button className="btn sm" onClick={saveVersion} title="Ctrl+S"><Icon name="star" />حفظ نسخة</button>
          <button className="btn sm" onClick={() => setVersionsOpen(true)}><Icon name="history" />النسخ ({model.versions.length})</button>
          <button className="btn sm" onClick={() => setExp('png')} disabled={!model.masses.length} title={model.masses.length ? '' : 'ارسمي كتلة أولاً'}><Icon name="image" />صورة PNG</button>
          <button className="btn sm" onClick={() => setExp('pdf')} disabled={!model.masses.length}><Icon name="pdf" />PDF</button>
          <button className="btn sm" onClick={() => setExp('glb')} disabled={!model.masses.length}><Icon name="cube" />GLB</button>
          <button className="btn sm" onClick={() => setExp('json')}><Icon name="download" />ملف المشروع</button>
        </div>
      </div>

      <ol className="editor-steps" aria-label="طريقة العمل">
        {STEPS.map((s) => (
          <li key={s.n} className={done[s.n - 1] ? 'done' : s.n === step ? 'current' : ''}>
            <span className="n">{done[s.n - 1] ? '✓' : s.n}</span>{s.t}
          </li>
        ))}
      </ol>

      <div className="editor-toolbar" role="toolbar" aria-label="أدوات المحرر">
        <div className="row" style={{ gap: 4 }}>
          {TOOLS.map((t) => (
            <button key={t.key} className={`tool-btn ${tool === t.key ? 'on' : ''}`} onClick={() => { setTool(t.key); if (['rect', 'poly', 'void', 'scale', 'image'].includes(t.key)) setView('plan'); }} title={`${t.help} (${t.key2})`} aria-pressed={tool === t.key} disabled={(t.key === 'scale' || t.key === 'image') && !model.reference}>
              <Icon name={t.icon} /><span>{t.label}</span><kbd>{t.key2}</kbd>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm icon" onClick={undo} disabled={past.current.length < 2} title="تراجع (Ctrl+Z)" aria-label="تراجع"><Icon name="arrowRight" /></button>
          <button className="btn sm icon" onClick={redo} disabled={!future.current.length} title="إعادة (Ctrl+Y)" aria-label="إعادة"><Icon name="arrowLeft" /></button>
        </div>
      </div>

      <div className="editor-main">
        <div className="editor-canvas-col">
          <div className="editor-viewbar">
            <Segmented value={view} onChange={setView} label="العرض" options={VIEWS} />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => engine.current?.fit()} title="F">ملاءمة العرض</button>
              <label className="check small" style={{ padding: 0 }}><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /><span>التقاط</span></label>
              <select className="select" style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }} value={gridStep} onChange={(e) => setGridStep(Number(e.target.value))} aria-label="خطوة الشبكة">
                {[0.1, 0.25, 0.5, 1, 2].map((g) => <option key={g} value={g}>شبكة {g} م</option>)}
              </select>
              <label className="check small" style={{ padding: 0 }}><input type="checkbox" checked={floorLines} onChange={(e) => setFloorLines(e.target.checked)} /><span>خطوط الطوابق</span></label>
            </div>
          </div>
          <div ref={host} className="editor-canvas" />
          <div className="editor-hint" aria-live="polite"><Icon name="info" size={15} />{hint || TOOLS.find((t) => t.key === tool)?.help}</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            الفأرة: يسار = أداة · يمين أو وسط = تحريك المشهد · العجلة = تقريب · في المنظور: يسار على الفراغ = تدوير. لوحة المفاتيح: Ctrl+Z / Ctrl+Y · Ctrl+D نسخ · Delete حذف · الأسهم تحريك (Shift = 1 م) · [ ] تدوير · Alt يلغي الالتقاط.
          </div>
        </div>

        <aside className="editor-panel">
          {!model.reference ? (
            <section className="card stack sm">
              <h3>1. صورة المسقط</h3>
              <p className="small muted" style={{ margin: 0 }}>ارفعي صورة أو PDF للمسقط لترسمي فوقه. يمكنك أيضاً الرسم بدون صورة.</p>
              <button className="btn bronze" onClick={() => fileInput.current?.click()}><Icon name="upload" />رفع صورة المسقط</button>
            </section>
          ) : (
            <section className="card stack sm">
              <div className="row between"><h3>صورة المسقط</h3><button className="btn ghost sm" onClick={() => fileInput.current?.click()}>استبدال</button></div>
              <div className="tiny muted">{model.reference.name}</div>
              {approx ? (
                <Note kind="warn">الأبعاد <strong>تقريبية</strong>: افترضنا أن عرض الصورة {fmt(model.reference.widthM, 1)} م. إن كان في المسقط بُعد معروف استعملي أداة «المقياس».</Note>
              ) : <Note kind="sage" icon="check">{model.scaleNote || 'الأبعاد مقاسة.'}</Note>}
              {approx && <button className="btn sm bronze" onClick={() => { setTool('scale'); setView('plan'); }}><Icon name="ruler" />ضبط المقياس من بُعد معروف</button>}
              <div className="grid g2" style={{ gap: 8 }}>
                <NumField label="عرض الصورة" unit={unit} value={round(model.reference.widthM)} min={0.5} onChange={(v) => v > 0 && setRef({ ...model.reference!, widthM: v }, 'عرض الصورة', 'w')} />
                <NumField label="تدوير الصورة" unit="°" value={round(model.reference.rot)} onChange={(v) => setRef({ ...model.reference!, rot: v }, 'تدوير الصورة', 'rot')} />
              </div>
              <div className="field">
                <label>الشفافية: {Math.round(model.reference.opacity * 100)}%</label>
                <input type="range" min={0.05} max={1} step={0.05} value={model.reference.opacity} onChange={(e) => setRef({ ...model.reference!, opacity: Number(e.target.value) }, 'شفافية الصورة', 'op')} aria-label="الشفافية" style={{ accentColor: 'var(--bronze)' }} />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <label className="check small" style={{ padding: 0 }}><input type="checkbox" checked={model.reference.locked} onChange={(e) => setRef({ ...model.reference!, locked: e.target.checked }, e.target.checked ? 'تثبيت الصورة' : 'إلغاء تثبيت الصورة')} /><span>مثبتة</span></label>
                <label className="check small" style={{ padding: 0 }}><input type="checkbox" checked={model.reference.visible} onChange={(e) => setRef({ ...model.reference!, visible: e.target.checked }, 'إظهار الصورة')} /><span>ظاهرة</span></label>
              </div>
              {!model.reference.locked && <p className="tiny muted" style={{ margin: 0 }}>لتحريك الصورة: أداة «تحريك الصورة» ثم اسحبيها.</p>}
            </section>
          )}
          <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadReference(f); e.target.value = ''; }} />

          {one ? (
            <MassPanel m={one} unit={unit} vertex={tool === 'edit' ? vertex : null} setMass={setMass} onDuplicate={duplicateSelected} onDelete={removeSelected} onEdit={() => { setTool('edit'); setView('plan'); }} onVertex={setVertex} />
          ) : sel.length > 1 ? (
            <section className="card stack sm">
              <h3>{sel.length} كتل محددة</h3>
              <p className="small muted" style={{ margin: 0 }}>الدمج يوحّد الكتل المتلامسة أو المتداخلة في كتلة واحدة بارتفاع أعلاها.</p>
              <button className="btn primary" onClick={mergeSelected}><Icon name="layers" />دمج الكتل (M)</button>
              <div className="row"><button className="btn sm" onClick={duplicateSelected}><Icon name="copy" />نسخ</button><button className="btn sm danger" onClick={removeSelected}><Icon name="trash" />حذف</button></div>
            </section>
          ) : (
            <section className="card stack sm">
              <h3>الكتل ({model.masses.length})</h3>
              {model.masses.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>ارسمي أول كتلة بأداة «مستطيل» (R) أو «شكل حر» (P) فوق المسقط.</p>
              ) : (
                <div className="list">
                  {model.masses.map((m) => (
                    <button key={m.id} className="list-item mass-row" onClick={() => setSelection([m.id])}>
                      <span className="swatch" style={{ background: m.color }} />
                      <span style={{ flex: 1, textAlign: 'start' }}>{m.name}</span>
                      <span className="tiny muted num">{fmt(massArea(m), 0)} م² · {fmt(m.height, 1)} م</span>
                    </button>
                  ))}
                </div>
              )}
              {model.masses.length > 0 && (
                <div className="result">
                  <div className="stat"><span className="v num">{fmt(totalArea, 0)}</span><span className="k">مساحة البصمة م²{approx ? ' (تقريبية)' : ''}</span></div>
                  <div className="stat"><span className="v num">{fmt(gfa, 0)}</span><span className="k">مساحة طابقية تقديرية م²</span></div>
                </div>
              )}
            </section>
          )}
          <section className="card stack sm">
            <button className="btn ghost sm danger" onClick={async () => { if (await confirm({ title: `حذف «${model.title}»؟`, body: 'يُحذف النموذج ونسخه وصورة المسقط المرفوعة إليه.', confirm: 'حذف', danger: true })) { await deleteModel(model.id); nav('/editor'); } }}><Icon name="trash" />حذف النموذج</button>
          </section>
        </aside>
      </div>

      {scaleAsk && <ScaleModal d={Math.hypot(scaleAsk.b[0] - scaleAsk.a[0], scaleAsk.b[1] - scaleAsk.a[1])} measured={model.measured} onClose={() => setScaleAsk(null)} onApply={applyScale} />}
      {versionsOpen && (
        <Modal title="النسخ المحفوظة" onClose={() => setVersionsOpen(false)}>
          <p className="small muted">«حفظ نسخة» (Ctrl+S) يحفظ لقطة كاملة من النموذج. الحفظ التلقائي يعمل دائماً على النسخة الحالية. فتح نسخة يمكن التراجع عنه بـ Ctrl+Z.</p>
          {model.versions.length === 0 ? <p className="small">لا نسخ بعد.</p> : (
            <div className="list">
              {model.versions.map((v) => (
                <div key={v.id} className="list-item">
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{v.name}</div><div className="tiny muted">{v.snapshot.masses.length} كتل</div></div>
                  <button className="btn sm" onClick={() => { commit({ ...model, ...structuredClone(v.snapshot) }, `فتح ${v.name}`); setVersionsOpen(false); setSelection([]); }}>فتح للتعديل</button>
                  <button className="btn ghost icon sm" aria-label="حذف النسخة" onClick={() => { const n = { ...model, versions: model.versions.filter((x) => x.id !== v.id) }; setModel(n); schedule(n); }}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {exp && <ExportPreview kind={exp} build={async () => { const r = await buildExport(exp); setExported(true); return r; }} onClose={() => setExp(null)} />}
    </div>
  );
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
function MassPanel({ m, unit, vertex, setMass, onDuplicate, onDelete, onEdit, onVertex }: {
  m: Mass; unit: string; vertex: number | null; setMass: (m: Mass, label: string, field?: string) => void;
  onDuplicate: () => void; onDelete: () => void; onEdit: () => void; onVertex: (v: number | null) => void;
}) {
  const b = bbox(m.outline);
  const floors = Math.round((m.height / Math.max(0.5, m.floorHeight)) * 10) / 10;
  const roofAdv = m.roof.type !== 'flat';
  return (
    <>
      <section className="card stack sm" aria-label="خصائص الكتلة">
        <div className="row between">
          <input className="input" style={{ fontWeight: 600, flex: 1 }} value={m.name} onChange={(e) => setMass({ ...m, name: e.target.value }, 'تسمية', 'name')} aria-label="اسم الكتلة" />
        </div>
        <div className="row" style={{ gap: 4 }}>
          {MASS_COLORS.map((c) => <button key={c} className={`swatch-btn ${m.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`لون ${c}`} onClick={() => setMass({ ...m, color: c }, 'لون')} />)}
        </div>
        <h3 style={{ marginTop: 6 }}>الأبعاد</h3>
        <div className="grid g2" style={{ gap: 8 }}>
          <NumField label="الطول (أفقي)" unit={unit} value={round(b.w)} min={0.3} onChange={(v) => v >= 0.3 && setMass(setMassSize(m, v, b.d), 'الطول', 'len')} />
          <NumField label="العرض" unit={unit} value={round(b.d)} min={0.3} onChange={(v) => v >= 0.3 && setMass(setMassSize(m, b.w, v), 'العرض', 'wid')} />
          <NumField label="الارتفاع (حتى الطنف)" unit={unit} value={round(m.height)} min={0.3} onChange={(v) => v >= 0.3 && setMass({ ...m, height: v }, 'الارتفاع', 'h')} />
          <NumField label="عدد الطوابق" value={floors} min={1} onChange={(v) => v >= 1 && setMass({ ...m, height: round(Math.round(v) * m.floorHeight) }, 'الطوابق', 'floors')} />
          <NumField label="ارتفاع الطابق" unit="m" value={round(m.floorHeight)} min={2.2} onChange={(v) => v >= 2.2 && setMass({ ...m, floorHeight: v }, 'ارتفاع الطابق', 'fh')} />
          <NumField label="منسوب القاعدة" unit="m" value={round(m.base)} onChange={(v) => setMass({ ...m, base: v }, 'منسوب القاعدة', 'base')} hint="لرفع كتلة فوق أخرى أو بروز معلّق" />
          <NumField label="الدوران" unit="°" value={round(m.rot, 1)} onChange={(v) => setMass({ ...m, rot: v }, 'تدوير', 'rot')} />
          <div className="field"><label>المساحة</label><div className="num" style={{ paddingTop: 8 }}>{fmt(massArea(m), 1)} م²{unit.includes('≈') ? ' (تقريبية)' : ''}</div></div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onEdit}><Icon name="edit" />تعديل الحدود (E)</button>
          <button className="btn sm" onClick={onDuplicate}><Icon name="copy" />نسخ (Ctrl+D)</button>
          <button className="btn sm danger" onClick={onDelete}><Icon name="trash" />حذف</button>
        </div>
      </section>

      <section className="card stack sm" aria-label="السقف">
        <h3>السقف</h3>
        <select className="select" value={m.roof.type} onChange={(e) => setMass({ ...m, roof: { ...m.roof, type: e.target.value as RoofType } }, 'نوع السقف')} aria-label="نوع السقف">
          {(Object.keys(ROOF_LABELS) as RoofType[]).map((r) => <option key={r} value={r}>{ROOF_LABELS[r]}</option>)}
        </select>
        {roofAdv && (
          <div className="grid g2" style={{ gap: 8 }}>
            <NumField label="ارتفاع السقف فوق الطنف" unit="m" value={round(m.roof.rise)} min={0} onChange={(v) => v >= 0 && setMass({ ...m, roof: { ...m.roof, rise: v } }, 'ارتفاع السقف', 'rise')} />
            <NumField label="اتجاه الميل / التموّج" unit="°" value={round(m.roof.dir, 0)} onChange={(v) => setMass({ ...m, roof: { ...m.roof, dir: v } }, 'اتجاه السقف', 'dir')} hint="0 = شمال، 90 = شرق" />
            {m.roof.type === 'wave' && <NumField label="عدد الموجات" value={m.roof.waves} min={1} max={8} onChange={(v) => v >= 1 && setMass({ ...m, roof: { ...m.roof, waves: Math.round(v) } }, 'الموجات', 'waves')} />}
          </div>
        )}
        {roofAdv && (
          <div className="row" style={{ gap: 4 }}>
            {[0, 90, 180, 270].map((d) => <button key={d} className={`btn sm ${m.roof.dir === d ? 'primary' : ''}`} onClick={() => setMass({ ...m, roof: { ...m.roof, dir: d } }, 'اتجاه السقف')}>{({ 0: 'ش', 90: 'ق', 180: 'ج', 270: 'غ' } as Record<number, string>)[d]}</button>)}
          </div>
        )}
      </section>

      <section className="card stack sm" aria-label="الزوايا والانحناء">
        <h3>الزوايا والانحناء</h3>
        <NumField label="تدوير كل الزوايا (نصف القطر)" unit="m" value={round(Math.max(0, ...m.radius))} min={0} onChange={(v) => v >= 0 && setMass({ ...m, radius: m.outline.map(() => v) }, 'تدوير الزوايا', 'rall')} hint="0 = زوايا حادة" />
        <p className="tiny muted" style={{ margin: 0 }}>لتقويس ضلع: أداة «تعديل الحدود» ثم اسحبي الدائرة في منتصف الضلع. لزاوية واحدة: انقري على نقطتها.</p>
        {vertex !== null && vertex < m.outline.length && (
          <div className="card flat tight stack sm" style={{ background: 'var(--ivory)' }}>
            <div className="label">النقطة {vertex + 1}</div>
            <NumField label="تدوير هذه الزاوية" unit="m" value={round(m.radius[vertex] ?? 0)} min={0} onChange={(v) => { if (v < 0) return; const r = m.radius.slice(); r[vertex] = v; setMass({ ...m, radius: r }, 'تدوير زاوية', `r${vertex}`); }} />
            <NumField label="تقوّس الضلع التالي" unit="m" value={round(m.bulge[vertex] ?? 0)} onChange={(v) => { const bl = m.bulge.slice(); bl[vertex] = v; setMass({ ...m, bulge: bl }, 'تقويس ضلع', `b${vertex}`); }} hint="موجب = للخارج، سالب = للداخل" />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => { setMass(insertVertex(m, vertex), 'إضافة نقطة'); onVertex(vertex + 1); }}><Icon name="plus" />نقطة بعدها</button>
              <button className="btn sm danger" disabled={m.outline.length <= 3} onClick={() => { setMass(removeVertex(m, vertex), 'حذف نقطة'); onVertex(null); }}><Icon name="trash" />حذف النقطة</button>
            </div>
          </div>
        )}
      </section>

      <section className="card stack sm" aria-label="الفراغات">
        <h3>الفراغات داخل الكتلة ({m.holes.length})</h3>
        {m.holes.length === 0 ? <p className="tiny muted" style={{ margin: 0 }}>لا يوجد فناء أو فراغ. لإضافة واحد: أداة «فراغ» (H) وارسمي شكله فوق الكتلة.</p> : (
          m.holes.map((h, i) => (
            <div key={i} className="row between small">
              <span>فراغ {i + 1} — {fmt(Math.abs(h.reduce((s, p, k) => s + p[0] * h[(k + 1) % h.length][1] - h[(k + 1) % h.length][0] * p[1], 0)) / 2, 1)} م²</span>
              <button className="btn sm" onClick={() => setMass({ ...m, holes: m.holes.filter((_, k) => k !== i) }, 'إغلاق فراغ')}>إغلاق الفراغ</button>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function ScaleModal({ d, measured, onClose, onApply }: { d: number; measured: boolean; onClose: () => void; onApply: (m: number) => void }) {
  const [v, setV] = useState(0);
  return (
    <Modal title="ضبط المقياس" onClose={onClose} footer={<><button className="btn primary" disabled={!(v > 0)} onClick={() => onApply(v)}>اعتماد</button><button className="btn ghost" onClick={onClose}>إلغاء</button></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>المسافة بين النقطتين في الرسم الحالي: {fmt(d, 2)} م{measured ? '' : ' (تقريبية)'}. أدخلي طولها الحقيقي — سيُعاد قياس الصورة وكل الكتل المرسومة معاً لتبقى منطبقة.</p>
        <NumField label="الطول الحقيقي" unit="m" value={v} onChange={setV} min={0} allowEmpty />
      </div>
    </Modal>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="شرح أدوات محرر الكتل" onClose={onClose} wide>
      <div className="stack">
        <ol className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
          {STEPS.map((s) => <li key={s.n}><strong>{s.t}</strong></li>)}
        </ol>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>الأداة</th><th>المفتاح</th><th>ماذا تفعل</th></tr></thead>
            <tbody>
              {TOOLS.map((t) => <tr key={t.key}><td>{t.label}</td><td><kbd>{t.key2}</kbd></td><td className="small">{t.help}</td></tr>)}
              <tr><td>الارتفاع بالسحب</td><td>—</td><td className="small">في «منظور 3D»: حددي الكتلة واسحبي الكرة البرونزية فوقها للأعلى أو الأسفل.</td></tr>
              <tr><td>دمج</td><td><kbd>M</kbd></td><td className="small">حددي كتلتين متلامستين (Shift + نقر) ثم «دمج».</td></tr>
              <tr><td>تراجع / إعادة</td><td><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd></td><td className="small">حتى 150 خطوة.</td></tr>
              <tr><td>حفظ نسخة</td><td><kbd>Ctrl+S</kbd></td><td className="small">الحفظ التلقائي يعمل دائماً؛ النسخة لقطة تعودين إليها.</td></tr>
            </tbody>
          </table>
        </div>
        <Note kind="info">الأبعاد تكون <strong>تقريبية</strong> حتى تضبطي المقياس من بُعد معروف في المسقط. الكتل عناصر هندسية حقيقية تُصدَّر GLB، والملف «ملف المشروع» يعيد فتح كل شيء للتعديل.</Note>
      </div>
    </Modal>
  );
}
