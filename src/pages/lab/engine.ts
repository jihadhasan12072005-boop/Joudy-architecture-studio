import { useEffect, useMemo, useState } from 'react';
import type { PlanStudy } from '../../db/types';
import { getBlob, getProject } from '../../db/repo';
import { loadRaster, type Raster } from '../../lab/io';
import {
  analyze, buildVolumes, estimatedScale, extract, heightField, resolve, travelField, type Extraction, type Resolved, type ScaleInfo, type Volume,
} from '../../lab/model';
import { TARTOUS } from '../../db/defaults';

export const ZONE_COLORS: Record<string, string> = {
  public: '#C9A27A',
  semi: '#9FB0A0',
  private: '#8C8FB0',
  service: '#B9B2A6',
  circulation: '#E3C567',
  '': '#E8E0D2',
};
export const ZONE_LABELS: Record<string, string> = {
  public: 'عام',
  semi: 'شبه عام',
  private: 'خاص',
  service: 'خدمات',
  circulation: 'حركة',
  '': 'غير محدد',
};

export function floorColor(f: number, max: number, min = 1): string {
  // ivory → bronze → charcoal ramp; a single height level gets a light stone tone
  const stops = [[239, 227, 208], [201, 162, 122], [154, 106, 60], [74, 62, 50]];
  const t = max <= min ? 0.3 : 0.12 + (0.78 * (f - min)) / (max - min);
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const k = x - i;
  const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface Engine {
  raster: Raster | null;
  ext: Extraction | null;
  res: Resolved | null;
  field: Uint8Array | null;
  volumes: Volume[];
  scale: ScaleInfo;
  center: [number, number];
  location: { lat: number; lon: number; utc: number; northAngle: number; fromProject: boolean };
  busy: string | null;
  error: string | null;
  pages: number;
  travel: Float32Array | null;
}

export function useEngine(study: PlanStudy | null): Engine {
  const [raster, setRaster] = useState<Raster | null>(null);
  const [busy, setBusy] = useState<string | null>('جارٍ قراءة الملف…');
  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState({ lat: TARTOUS.latitude, lon: TARTOUS.longitude, utc: TARTOUS.utcOffset, northAngle: 0, fromProject: false });

  const srcKey = study ? `${study.sourceBlobId}|${study.pdfPage}|${study.workMaxSide}` : '';
  useEffect(() => {
    if (!study) return;
    let alive = true;
    setBusy('جارٍ قراءة الملف…');
    setError(null);
    (async () => {
      try {
        const blob = await getBlob(study.sourceBlobId);
        if (!blob) throw new Error('الملف الأصلي غير موجود.');
        const r = await loadRaster(blob, study.sourceMime, study.sourceName, study.pdfPage, study.workMaxSide);
        if (alive) setRaster(r);
      } catch (e) {
        if (alive) setError(`تعذّر فتح الملف: ${(e as Error).message}`);
      } finally {
        if (alive) setBusy(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey]);

  useEffect(() => {
    if (!study?.projectId) {
      setLoc((l) => ({ ...l, northAngle: study?.northAngle ?? 0, fromProject: false }));
      return;
    }
    getProject(study.projectId).then((p) => {
      if (p) setLoc({ lat: p.site.latitude, lon: p.site.longitude, utc: p.site.utcOffset, northAngle: study.northAngle ?? p.site.northAngle, fromProject: true });
    });
  }, [study?.projectId, study?.northAngle]);

  const paramsKey = study ? JSON.stringify(study.params) : '';
  const ext = useMemo(() => {
    if (!raster || !study) return null;
    try {
      return extract(raster.data, raster.w, raster.h, study.params);
    } catch (e) {
      console.error(e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raster, paramsKey]);

  const settingsKey = study ? JSON.stringify([study.spaces, study.defaultFloors]) : '';
  const res = useMemo(() => (ext && study ? resolve(ext, study.spaces, study.defaultFloors) : null), [ext, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = useMemo(() => (ext && res && study ? heightField(ext, res, study.mode === 'block' ? study.defaultFloors : undefined) : null), [ext, res, study?.mode, study?.defaultFloors]); // eslint-disable-line react-hooks/exhaustive-deps
  const volumes = useMemo(
    () => (ext && field && study ? buildVolumes(ext, field, study.mode, study.floorHeight, study.explodeGap) : []),
    [ext, field, study?.mode, study?.floorHeight, study?.explodeGap], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const scale = useMemo<ScaleInfo>(() => study?.scale ?? (ext ? estimatedScale(ext) : { mPerPx: 0.05, method: 'estimate' }), [study?.scale, ext]);
  const center = useMemo<[number, number]>(() => {
    if (!ext) return [0, 0];
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < ext.footprint.length; i += 3) if (ext.footprint[i]) { const x = i % ext.w; sx += x; sy += (i - x) / ext.w; n++; }
    return n ? [sx / n, sy / n] : [ext.w / 2, ext.h / 2];
  }, [ext]);
  const entrKey = study ? JSON.stringify(study.entrances) : '';
  const travel = useMemo(() => (ext && study ? travelField(ext, study.entrances) : null), [ext, entrKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    raster, ext, res, field, volumes, scale, center, busy: busy ?? (raster && !ext ? 'جارٍ تحليل المسقط…' : null), error, pages: raster?.pages ?? 1, travel,
    location: { lat: loc.lat, lon: loc.lon, utc: loc.utc, northAngle: study?.northAngle ?? loc.northAngle, fromProject: loc.fromProject },
  };
}

export function useMetrics(e: Engine, study: PlanStudy | null) {
  const entrKey = study ? JSON.stringify(study.entrances) : '';
  return useMemo(
    () => (e.ext && e.res && e.field && study ? analyze(e.ext, e.res, e.field, e.scale.mPerPx, study.entrances, study.travelLimit, study.floorHeight) : null),
    [e.ext, e.res, e.field, e.scale.mPerPx, entrKey, study?.travelLimit], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
