// Export integrity: never hand the user an empty file.
// Raster exports are measured (share of pixels that differ from the background);
// GLB exports are parsed (mesh & triangle count). Failures raise ExportError
// with a clear Arabic message.

export class ExportError extends Error {}

export interface ImageCheck {
  contentPct: number;
  width: number;
  height: number;
}

/** Share of pixels that differ clearly from the dominant (background) colour. */
export function measureContent(src: CanvasImageSource, width: number, height: number): ImageCheck {
  const S = 220;
  const k = Math.min(1, S / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const counts = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [(bgKey >> 10) << 3, ((bgKey >> 5) & 31) << 3, (bgKey & 31) << 3];
  let diff = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) diff++;
  }
  return { contentPct: (100 * diff) / (w * h), width, height };
}

export const MIN_CONTENT_PCT = 1;

export async function checkImageBlob(blob: Blob): Promise<ImageCheck> {
  if (!blob || blob.size < 200) throw new ExportError('الصورة الناتجة فارغة أو تالفة.');
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new ExportError('تعذّر قراءة الصورة الناتجة.');
    const r = measureContent(img, img.naturalWidth, img.naturalHeight);
    if (r.contentPct < MIN_CONTENT_PCT) {
      throw new ExportError('الصورة الناتجة لا تحتوي على التصميم (خلفية فقط). تأكدي أن التصميم ظاهر في العارض ثم أعيدي المحاولة — لم يُنزَّل أي ملف.');
    }
    return r;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function checkCanvas(c: HTMLCanvasElement): ImageCheck {
  if (!c.width || !c.height) throw new ExportError('اللوحة فارغة (أبعادها صفر).');
  const r = measureContent(c, c.width, c.height);
  if (r.contentPct < MIN_CONTENT_PCT) throw new ExportError('اللوحة الناتجة فارغة — لم يُنزَّل أي ملف. أعيدي إنشاءها بعد ظهور التصميم.');
  return r;
}

export interface GlbCheck {
  meshes: number;
  triangles: number;
  bytes: number;
}

export async function checkGlb(blob: Blob): Promise<GlbCheck> {
  const buf = new DataView(await blob.arrayBuffer());
  if (buf.byteLength < 20 || buf.getUint32(0, true) !== 0x46546c67) throw new ExportError('ملف GLB الناتج تالف.');
  const jsonLen = buf.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf.buffer, 20, jsonLen))) as {
    meshes?: { primitives: { attributes: { POSITION: number }; mode?: number }[] }[];
    accessors?: { count: number }[];
  };
  let triangles = 0;
  for (const m of json.meshes ?? []) for (const p of m.primitives) if (p.mode === undefined || p.mode === 4) triangles += (json.accessors?.[p.attributes.POSITION]?.count ?? 0) / 3;
  const meshes = json.meshes?.length ?? 0;
  if (!meshes || triangles < 4) throw new ExportError('النموذج الناتج لا يحتوي على مجسمات — لم يُنزَّل أي ملف.');
  return { meshes, triangles: Math.round(triangles), bytes: blob.size };
}

/** Wait for the browser to present frames (so WebGL content is really drawn). */
export function nextFrames(n = 2): Promise<void> {
  return new Promise((res) => {
    const step = (k: number) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });
}

export function canShareFiles(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try {
    return !!nav.canShare && nav.canShare({ files: [file] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}
