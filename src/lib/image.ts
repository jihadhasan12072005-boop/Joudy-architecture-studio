// Browser-side image helpers (thumbnails, downscaling before AI upload).

async function loadImage(blob: Blob): Promise<{ img: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(blob);
      return { img: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> (e.g. SVG in some browsers) */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { img, width: img.naturalWidth || 1200, height: img.naturalHeight || 900, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
}

function draw(img: CanvasImageSource, w: number, h: number, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s));
  const ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // drawings with transparency become readable on white
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cw, ch);
  return c;
}

export function isImage(mime: string): boolean {
  return /^image\/(png|jpe?g|webp|gif|svg\+xml|bmp|avif)$/.test(mime);
}

export function isPdf(mime: string, name = ''): boolean {
  return mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

/** Thumbnail (max 480 px) + intrinsic dimensions. Returns null for non-images or undecodable files. */
export async function makeThumb(blob: Blob): Promise<{ thumb: Blob; width: number; height: number } | null> {
  if (!isImage(blob.type)) return null;
  try {
    const { img, width, height, close } = await loadImage(blob);
    const c = draw(img, width, height, 480);
    close();
    return { thumb: await canvasToBlob(c, 'image/jpeg', 0.82), width, height };
  } catch {
    return null;
  }
}

/**
 * Downscale an image for AI analysis. Long side ≤ maxSide, JPEG.
 * Smaller images = fewer input tokens = lower cost.
 */
export async function imageForAI(blob: Blob, maxSide = 1536, quality = 0.85): Promise<{ dataUrl: string; bytes: number; width: number; height: number }> {
  const { img, width, height, close } = await loadImage(blob);
  const c = draw(img, width, height, maxSide);
  close();
  const out = await canvasToBlob(c, 'image/jpeg', quality);
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(out);
  });
  return { dataUrl, bytes: out.size, width: c.width, height: c.height };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
