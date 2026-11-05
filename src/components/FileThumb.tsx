import { useEffect, useState } from 'react';
import { getThumb } from '../db/repo';
import type { FileMeta } from '../db/types';
import { useObjectUrl } from '../lib/hooks';
import { isPdf } from '../lib/image';
import { Icon } from './Icon';

export function useThumb(id: string | undefined) {
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    let alive = true;
    if (id) getThumb(id).then((b) => alive && setBlob(b));
    else setBlob(undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  return useObjectUrl(blob);
}

export function ThumbImage({ id, alt }: { id?: string; alt: string }) {
  const url = useThumb(id);
  return url ? <img src={url} alt={alt} loading="lazy" /> : <div className="ph"><Icon name="image" /></div>;
}

export const CATEGORY_LABEL: Record<FileMeta['category'], string> = {
  plan: 'مسقط — Plan',
  elevation: 'واجهة — Elevation',
  section: 'مقطع — Section',
  site: 'موقع عام — Site plan',
  detail: 'تفصيلة — Detail',
  diagram: 'مخطط فكرة — Diagram',
  render: 'إظهار — Rendering',
  reference: 'مرجع / صورة موقع',
  brief: 'برنامج / وثيقة',
  other: 'أخرى',
};

export function FileTile({ f, onOpen, badge }: { f: FileMeta; onOpen: () => void; badge?: string }) {
  const pdf = isPdf(f.mime, f.name);
  return (
    <button className="thumb" onClick={onOpen} title={f.title} type="button">
      {pdf ? (
        <div className="ph" style={{ flexDirection: 'column', gap: 4 }}>
          <Icon name="pdf" />
          <span className="tiny">PDF</span>
        </div>
      ) : (
        <ThumbImage id={f.id} alt={f.title} />
      )}
      {badge && <span className="badge dark ver">{badge}</span>}
      <span className="cap">{f.title}</span>
    </button>
  );
}
