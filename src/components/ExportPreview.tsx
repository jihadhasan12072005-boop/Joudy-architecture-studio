import { useEffect, useState } from 'react';
import { Modal, Note } from './ui';
import { Icon } from './Icon';
import { canShareFiles, checkGlb, checkImageBlob, ExportError } from '../lib/exportGuard';
import { downloadBlobAs } from '../lab/io';
import { fmtBytes } from '../lib/format';

export type ExportKind = 'png' | 'pdf' | 'glb' | 'obj' | 'json' | 'svg';

export interface ExportResult {
  blob: Blob;
  filename: string;
  /** Image shown in the preview (for PDF / GLB this is the rendered view that the file contains). */
  preview?: Blob;
  note?: string;
}

const KIND_LABEL: Record<ExportKind, string> = {
  png: 'صورة PNG',
  pdf: 'ملف PDF',
  glb: 'نموذج ثلاثي الأبعاد GLB',
  obj: 'نموذج OBJ',
  json: 'ملف مشروع قابل للتعديل',
  svg: 'رسم متجهي SVG',
};

/**
 * Builds the export, verifies it is not empty, shows it, and only then lets the
 * user download / share it.
 */
export function ExportPreview({ kind, build, onClose }: { kind: ExportKind; build: () => Promise<ExportResult>; onClose: () => void }) {
  const [state, setState] = useState<{ phase: 'working' } | { phase: 'ready'; r: ExportResult; url: string | null; info: string } | { phase: 'error'; msg: string }>({ phase: 'working' });

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    (async () => {
      try {
        const r = await build();
        let info = fmtBytes(r.blob.size);
        if (kind === 'png') {
          const c = await checkImageBlob(r.blob);
          info += ` · ${c.width}×${c.height} بكسل`;
        } else if (kind === 'pdf' || kind === 'svg') {
          if (!r.preview) throw new ExportError('تعذّر إنشاء معاينة الملف.');
          await checkImageBlob(r.preview);
        } else if (kind === 'glb') {
          const g = await checkGlb(r.blob);
          info += ` · ${g.meshes} مجسم · ${g.triangles.toLocaleString('en-US')} مثلث`;
          if (r.preview) await checkImageBlob(r.preview);
        } else if (r.blob.size < 20) throw new ExportError('الملف الناتج فارغ — لم يُنزَّل.');
        const show = r.preview ?? (kind === 'png' ? r.blob : null);
        url = show ? URL.createObjectURL(show) : null;
        if (alive) setState({ phase: 'ready', r, url, info });
      } catch (e) {
        console.error(e);
        const msg = e instanceof ExportError ? e.message : `فشل إنشاء الملف: ${(e as Error).message || e}`;
        if (alive) setState({ phase: 'error', msg });
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async (r: ExportResult) => {
    const file = new File([r.blob], r.filename, { type: r.blob.type || 'application/octet-stream' });
    try {
      await (navigator as Navigator & { share: (d: { files: File[]; title: string }) => Promise<void> }).share({ files: [file], title: r.filename });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Modal
      title={`تصدير — ${KIND_LABEL[kind]}`}
      onClose={onClose}
      wide
      footer={
        state.phase === 'ready' ? (
          <>
            <button className="btn primary" onClick={() => { downloadBlobAs(state.r.blob, state.r.filename); onClose(); }} autoFocus><Icon name="download" />تنزيل الملف</button>
            {canShareFiles(new File([state.r.blob], state.r.filename, { type: state.r.blob.type })) && (
              <button className="btn" onClick={() => share(state.r)}><Icon name="upload" />مشاركة / حفظ في الملفات</button>
            )}
            <button className="btn ghost" onClick={onClose}>رجوع للتعديل</button>
          </>
        ) : (
          <button className="btn ghost" onClick={onClose}>إغلاق</button>
        )
      }
    >
      {state.phase === 'working' && <div className="export-preview center"><span className="save-dot saving">جارٍ إنشاء الملف والتحقق من محتواه…</span></div>}
      {state.phase === 'error' && <Note kind="danger">{state.msg}</Note>}
      {state.phase === 'ready' && (
        <div className="stack sm">
          {state.url ? <img className="export-preview" src={state.url} alt="معاينة الملف المُصدَّر" /> : <div className="export-preview center muted">لا توجد معاينة صورية لهذا النوع.</div>}
          <div className="row between small">
            <span><strong>{state.r.filename}</strong></span>
            <span className="muted num">{state.info}</span>
          </div>
          <Note kind="sage" icon="check">تحققنا من الملف: يحتوي على التصميم{kind === 'pdf' ? ' (هذه هي الصفحة كما ستظهر في PDF)' : kind === 'glb' ? ' (المعاينة صورة من المشهد نفسه)' : ''}.{state.r.note ? ` ${state.r.note}` : ''}</Note>
          {kind === 'glb' && <p className="tiny muted" style={{ margin: 0 }}>ملف GLB يُفتح في Blender أو «عارض ثلاثي الأبعاد» في Windows أو SketchUp (بإضافة). على iPhone قد لا يعرضه تطبيق «الملفات» — استعملي PNG أو PDF للمشاهدة السريعة.</p>}
          {kind === 'json' && <p className="tiny muted" style={{ margin: 0 }}>هذا ملف بيانات لإعادة فتح المشروع داخل التطبيق («فتح ملف مشروع محفوظ») — ليس صورة، ولا يُعرض في المتصفح كتصميم.</p>}
        </div>
      )}
    </Modal>
  );
}
