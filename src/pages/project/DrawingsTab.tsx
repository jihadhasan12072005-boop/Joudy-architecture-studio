import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { TabProps } from './ProjectWorkspace';
import type { FileCategory, FileMeta } from '../../db/types';
import { addFile, deleteFile, getBlob, listFiles, MAX_FILE_BYTES, updateFileMeta } from '../../db/repo';
import { useLive } from '../../lib/hooks';
import { isImage, isPdf, makeThumb, downloadBlob } from '../../lib/image';
import { fmtBytes, fmtDate } from '../../lib/format';
import { Icon } from '../../components/Icon';
import { Checklist, Empty, Modal, Note, useConfirm, useToast } from '../../components/ui';
import { CATEGORY_LABEL, FileTile } from '../../components/FileThumb';
import { DrawingViewer } from '../../components/DrawingViewer';
import { DRAWING_CHECKS } from '../../data/checklists';
import { checkStorage } from '../../lib/storage';

const CATS = Object.keys(CATEGORY_LABEL) as FileCategory[];

export function DrawingsTab({ project: p, update }: TabProps) {
  const files = useLive(() => listFiles(p.id), [p.id]) ?? [];
  const [cat, setCat] = useState<FileCategory | 'all'>('all');
  const [uploadCat, setUploadCat] = useState<FileCategory>('plan');
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [openSheet, setOpenSheet] = useState<{ sheetId: string; fileId: string } | null>(null);
  const [editing, setEditing] = useState<FileMeta | null>(null);
  const [params, setParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const versionInput = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();

  // Group versions by sheet (newest version first).
  const sheets = useMemo(() => {
    const m = new Map<string, FileMeta[]>();
    for (const f of files) m.set(f.sheetId, [...(m.get(f.sheetId) ?? []), f]);
    return [...m.values()].map((vs) => vs.sort((a, b) => b.version - a.version)).sort((a, b) => b[0].createdAt - a[0].createdAt);
  }, [files]);
  const shown = sheets.filter((vs) => cat === 'all' || vs[0].category === cat);

  useEffect(() => {
    const open = params.get('open');
    if (open && files.length) {
      const f = files.find((x) => x.id === open);
      if (f) setOpenSheet({ sheetId: f.sheetId, fileId: f.id });
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, files, setParams]);

  async function ingest(list: FileList | File[], sheetId?: string) {
    const arr = [...list];
    let ok = 0;
    for (const file of arr) {
      if (!isImage(file.type) && !isPdf(file.type, file.name)) {
        toast(`«${file.name}»: نوع غير مدعوم. المدعوم: صور (PNG/JPG/WebP) وملفات PDF.`, 'error');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast(`«${file.name}» أكبر من ${fmtBytes(MAX_FILE_BYTES)}. صغّري الملف أو صدّريه بدقة أقل.`, 'error');
        continue;
      }
      setBusy(`جارٍ حفظ ${file.name}…`);
      try {
        const t = await makeThumb(file);
        await addFile({ projectId: p.id, blob: file, name: file.name, category: uploadCat, sheetId, thumb: t?.thumb, width: t?.width, height: t?.height });
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast(/quota/i.test(msg) ? 'لا توجد مساحة تخزين كافية على الجهاز. احذفي ملفات قديمة أو خذي نسخة احتياطية وانقلي مشاريع منتهية.' : `تعذّر حفظ ${file.name}: ${msg}`, 'error');
      }
    }
    setBusy(null);
    if (ok) toast(ok === 1 ? (sheetId ? 'أُضيفت نسخة جديدة' : 'حُفظ الملف') : `حُفظ ${ok} ملفات`);
    const warn = await checkStorage();
    if (warn) toast(warn, 'error');
  }

  const openVersions = openSheet ? sheets.find((vs) => vs[0].sheetId === openSheet.sheetId) : undefined;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files); }}
      >
        <div className="stack" style={{ alignItems: 'center' }}>
          <Icon name="upload" size={34} />
          <div style={{ fontWeight: 600 }}>اسحبي المخططات هنا أو اختاري من الجهاز</div>
          <div className="small muted">صور PNG / JPG / WebP، وملفات PDF — حتى {fmtBytes(MAX_FILE_BYTES)} للملف. تُحفظ على هذا الجهاز فقط.</div>
          <div className="row">
            <select className="select" style={{ width: 'auto' }} value={uploadCat} onChange={(e) => setUploadCat(e.target.value as FileCategory)} aria-label="نوع المخطط">
              {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={!!busy}><Icon name="upload" />اختيار ملفات</button>
          </div>
          {busy && <span className="save-dot saving">{busy}</span>}
        </div>
        <input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf" hidden onChange={(e) => { if (e.target.files) void ingest(e.target.files); e.target.value = ''; }} />
        <input
          ref={versionInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
          hidden
          onChange={(e) => {
            if (e.target.files && versionTarget.current) void ingest(e.target.files, versionTarget.current);
            e.target.value = '';
          }}
        />
      </section>

      <div className="grid split">
        <section>
          <div className="row" style={{ marginBottom: 14, gap: 6 }}>
            <button className={`btn sm ${cat === 'all' ? 'primary' : ''}`} onClick={() => setCat('all')}>الكل ({sheets.length})</button>
            {CATS.filter((c) => sheets.some((vs) => vs[0].category === c)).map((c) => (
              <button key={c} className={`btn sm ${cat === c ? 'primary' : ''}`} onClick={() => setCat(c)}>
                {CATEGORY_LABEL[c].split(' — ')[0]} ({sheets.filter((vs) => vs[0].category === c).length})
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="card"><Empty icon="image" title="لا توجد ملفات هنا بعد">ارفعي أول مخطط. عند تعديل المخطط لاحقاً استعملي «نسخة جديدة» لتحتفظي بتطور التصميم وتقارني بين النسخ.</Empty></div>
          ) : (
            <div className="thumb-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))' }}>
              {shown.map((vs) => (
                <div key={vs[0].sheetId} className="stack sm">
                  <FileTile f={vs[0]} badge={vs.length > 1 ? `${vs.length} نسخ` : undefined} onOpen={() => setOpenSheet({ sheetId: vs[0].sheetId, fileId: vs[0].id })} />
                  <div className="row between tiny muted" style={{ gap: 4 }}>
                    <span>{CATEGORY_LABEL[vs[0].category].split(' — ')[0]} · v{vs[0].version}</span>
                    <span>{fmtDate(vs[0].createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 12 }}>للمقارنة بالسحب، صدّري النسخ بنفس الإطار والدقة حتى تتطابق الصور.</p>
        </section>

        <aside className="card">
          <div className="card-head"><h3>قائمة المخططات المطلوبة</h3><span className="badge num">{DRAWING_CHECKS.filter((c) => p.presentation.boardChecklist['d-' + c.id]).length}/{DRAWING_CHECKS.length}</span></div>
          <Checklist
            items={DRAWING_CHECKS.map((c) => ({ ...c, id: 'd-' + c.id }))}
            state={p.presentation.boardChecklist}
            onToggle={(id, v) => update((x) => ({ ...x, presentation: { ...x.presentation, boardChecklist: { ...x.presentation.boardChecklist, [id]: v } } }))}
          />
        </aside>
      </div>

      {openVersions && openSheet && (
        <DrawingViewer
          versions={openVersions}
          initialId={openSheet.fileId}
          onClose={() => setOpenSheet(null)}
          actions={(f) => (
            <>
              <button className="btn sm" onClick={() => { versionTarget.current = f.sheetId; versionInput.current?.click(); }}><Icon name="plus" /><span className="hide-mobile">نسخة جديدة</span></button>
              <button className="btn sm" onClick={() => setEditing(f)}><Icon name="edit" /><span className="hide-mobile">تعديل</span></button>
              {isImage(f.mime) && (
                <button className="btn sm" onClick={() => { update((x) => ({ ...x, coverFileId: f.id })); toast('أصبحت صورة غلاف المشروع'); }}><Icon name="star" /><span className="hide-mobile">غلاف</span></button>
              )}
              {(isImage(f.mime) || isPdf(f.mime, f.name)) && (
                <button className="btn sm bronze" onClick={() => nav(`/lab?file=${f.id}`)}><Icon name="cube" /><span className="hide-mobile">توليد كتلة</span></button>
              )}
              {isImage(f.mime) && (
                <button className="btn sm" onClick={() => nav(`/assistant?project=${p.id}&file=${f.id}`)}><Icon name="spark" /><span className="hide-mobile">اسألي المساعد</span></button>
              )}
              <button className="btn sm icon" aria-label="تنزيل" onClick={async () => { const b = await getBlob(f.id); if (b) downloadBlob(b, f.name); }}><Icon name="download" /></button>
              <button
                className="btn sm icon"
                aria-label="حذف هذه النسخة"
                onClick={async () => {
                  if (await confirm({ title: `حذف النسخة ${f.version} من «${f.title}»؟`, body: 'يُحذف الملف من هذا الجهاز نهائياً.', confirm: 'حذف', danger: true })) {
                    await deleteFile(f.id);
                    if (p.coverFileId === f.id) update((x) => ({ ...x, coverFileId: undefined }));
                    const rest = openVersions.filter((v) => v.id !== f.id);
                    setOpenSheet(rest.length ? { sheetId: f.sheetId, fileId: rest[0].id } : null);
                  }
                }}
              >
                <Icon name="trash" />
              </button>
            </>
          )}
        />
      )}

      {editing && <EditFileModal f={editing} onClose={() => setEditing(null)} />}
      {files.length > 0 && <Note kind="info">الملفات محفوظة داخل المتصفح على هذا الجهاز. لنقلها إلى جهاز آخر استعملي النسخة الاحتياطية من الإعدادات.</Note>}
    </div>
  );
}

function EditFileModal({ f, onClose }: { f: FileMeta; onClose: () => void }) {
  const [title, setTitle] = useState(f.title);
  const [category, setCategory] = useState(f.category);
  const [note, setNote] = useState(f.note);
  return (
    <Modal
      title="تفاصيل المخطط"
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={async () => { await updateFileMeta(f.id, { title: title.trim() || f.title, category, note }); onClose(); }}>حفظ</button>
          <button className="btn ghost" onClick={onClose}>إلغاء</button>
        </>
      }
    >
      <div className="stack">
        <div className="field"><label htmlFor="ft">العنوان (لكل النسخ)</label><input id="ft" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="fc">النوع</label>
          <select id="fc" className="select" value={category} onChange={(e) => setCategory(e.target.value as FileCategory)}>
            {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="fn">ملاحظة على هذه النسخة</label><textarea id="fn" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ما الذي تغيّر في هذه النسخة؟ ملاحظات الأستاذ؟" /></div>
        <div className="tiny muted">الملف: {f.name} · {fmtBytes(f.size)}{f.width ? ` · ${f.width}×${f.height}px` : ''}</div>
      </div>
    </Modal>
  );
}
