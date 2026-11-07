// Input/output helpers for the plan lab: load images & PDFs into a working
// raster, export PNG / PDF, and draw the built-in sample plan.

export const WORK_MAX_SIDE = 1100;

export interface Raster {
  data: Uint8ClampedArray;
  w: number;
  h: number;
  canvas: HTMLCanvasElement; // working-size rendering of the source (for display)
  pages?: number;
}

function canvasFor(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

async function loadBitmap(blob: Blob): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(blob);
    return { draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), w: img.naturalWidth || 1200, h: img.naturalHeight || 900, close: () => URL.revokeObjectURL(url) };
  }
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = worker;
      return lib;
    })();
  }
  return pdfjsPromise;
}

/** Render a PDF page to a canvas whose long side is `maxSide` px. */
export async function renderPdfPage(blob: Blob, page: number, maxSide: number): Promise<{ canvas: HTMLCanvasElement; pages: number }> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const v1 = p.getViewport({ scale: 1 });
  const scale = maxSide / Math.max(v1.width, v1.height);
  const vp = p.getViewport({ scale });
  const canvas = canvasFor(vp.width, vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;
  const pages = doc.numPages;
  void doc.destroy();
  return { canvas, pages };
}

export function isPdfBlob(mime: string, name = '') {
  return mime === 'application/pdf' || /\.pdf$/i.test(name);
}

/** Source file → working raster (long side ≤ maxSide, white background). */
export async function loadRaster(blob: Blob, mime: string, name: string, page = 1, maxSide = WORK_MAX_SIDE): Promise<Raster> {
  let canvas: HTMLCanvasElement;
  let pages: number | undefined;
  if (isPdfBlob(mime, name)) {
    const r = await renderPdfPage(blob, page, maxSide);
    canvas = r.canvas;
    pages = r.pages;
  } else {
    const b = await loadBitmap(blob);
    const s = Math.min(1, maxSide / Math.max(b.w, b.h));
    // Upscale small screenshots a little so thin walls survive processing.
    const up = Math.max(b.w, b.h) < 700 ? Math.min(2, 900 / Math.max(b.w, b.h)) : 1;
    const k = s * up;
    canvas = canvasFor(b.w * k, b.h * k);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    b.draw(ctx, canvas.width, canvas.height);
    b.close();
  }
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  return { data, w: canvas.width, h: canvas.height, canvas, pages };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function downloadBlobAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function safeName(s: string) {
  return (s || 'joudy-study').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 60);
}

/** Serialise an <svg> element and rasterise it to PNG at `scale`. */
export async function svgToPng(svg: SVGSVGElement, scale = 2, background = '#ffffff'): Promise<Blob> {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth;
  const h = vb && vb.height ? vb.height : svg.clientHeight;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();
  const c = canvasFor(w * scale, h * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Minimal single-page PDF that embeds a JPEG (no external library — Arabic
 * text is rendered into the image by the browser, so shaping is correct).
 * Page size: A3 landscape (or portrait when the image is taller).
 */
export async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const jpeg = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const landscape = canvas.width >= canvas.height;
  const [PW, PH] = landscape ? [1190.55, 841.89] : [841.89, 1190.55];
  const k = Math.min(PW / canvas.width, PH / canvas.height);
  const iw = canvas.width * k, ih = canvas.height * k;
  const ox = (PW - iw) / 2, oy = (PH - ih) / 2;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const add = (x: string | Uint8Array) => {
    const u = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(u);
    len += u.length;
  };
  const obj = (n: number, body: string) => { offsets[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`); };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
  add(bytes);
  add('\nendstream\nendobj\n');
  const content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ox.toFixed(2)} ${oy.toFixed(2)} cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  add(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Built-in sample plan (so Joudy can try every feature immediately)
// ---------------------------------------------------------------------------
/** A courtyard building drawn like a typical student plan: 30 px = 1 m. */
export async function drawSamplePlan(): Promise<Blob> {
  const W = 1400, H = 1000, M = 30; // px per metre
  const c = canvasFor(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  const x0 = 160, y0 = 140; // building origin
  const wall = 9; // 0.30 m
  const R = (x: number, y: number, w: number, h: number) => { g.fillStyle = '#1d1b18'; g.fillRect(x0 + x * M, y0 + y * M, w * M, h * M); };
  const clear = (x: number, y: number, w: number, h: number) => { g.fillStyle = '#fff'; g.fillRect(x0 + x * M, y0 + y * M, w * M, h * M); };
  const t = wall / M;
  // Outline: L-shaped 36 × 22 m with a 12 × 8 m notch (entrance forecourt) at bottom-right
  R(0, 0, 36, t); R(0, 0, t, 22); R(0, 22 - t, 24, t); R(36 - t, 0, t, 14); R(24, 14 - t, 12, t); R(24 - t, 14, t, 8);
  // Courtyard 10 × 6 m
  R(8, 6, 10, t); R(8, 12 - t, 10, t); R(8, 6, t, 6); R(18 - t, 6, t, 6);
  // Partitions
  R(8, 0, t, 6); R(18 - t, 0, t, 6); R(26, 0, t, 14); R(0, 12 - t, 8, t); R(8, 12, t, 10); R(18 - t, 12, t, 10); R(18, 9, 8, t);
  // Doors (1.0 m) with swing arcs, windows (1.5 m) with thin double lines, main entrance 2 m
  const door = (x: number, y: number, vertical: boolean) => {
    if (vertical) clear(x, y, t, 1); else clear(x, y, 1, t);
    g.strokeStyle = '#444'; g.lineWidth = 1.2;
    g.beginPath();
    const px = x0 + x * M, py = y0 + y * M;
    if (vertical) { g.moveTo(px, py); g.lineTo(px + M, py); g.arc(px, py, M, 0, Math.PI / 2); }
    else { g.moveTo(px, py); g.lineTo(px, py + M); g.arc(px, py, M, Math.PI / 2, 0, true); }
    g.stroke();
  };
  const win = (x: number, y: number, len: number, vertical: boolean) => {
    if (vertical) clear(x, y, t, len); else clear(x, y, len, t);
    g.strokeStyle = '#333'; g.lineWidth = 1;
    g.beginPath();
    const px = x0 + x * M, py = y0 + y * M;
    if (vertical) for (const dx of [0, wall / 2, wall]) { g.moveTo(px + dx, py); g.lineTo(px + dx, py + len * M); }
    else for (const dy of [0, wall / 2, wall]) { g.moveTo(px, py + dy); g.lineTo(px + len * M, py + dy); }
    g.stroke();
  };
  door(8, 2, true); door(18 - t, 3, true); door(26, 4, true); door(3, 12 - t, false); door(8, 15, true); door(18 - t, 16, true); door(21, 9, false); door(30, 14 - t, false);
  clear(24 - t, 17, t, 2); // main entrance
  win(2, 0, 1.5, false); win(12, 0, 1.5, false); win(20, 0, 1.5, false); win(30, 0, 1.5, false);
  win(0, 4, 1.5, true); win(0, 16, 1.5, true); win(4, 22 - t, 1.5, false); win(12, 22 - t, 1.5, false);
  win(36 - t, 5, 1.5, true); win(11, 6, 1.5, false); win(11, 12 - t, 1.5, false);
  // Courtyard: paving hatch + trees (thin lines)
  g.strokeStyle = '#999'; g.lineWidth = 1;
  for (let k = 0; k < 18; k++) { g.beginPath(); g.moveTo(x0 + 8.4 * M + k * 16, y0 + 6.4 * M); g.lineTo(x0 + 8.4 * M + k * 16 - 40, y0 + 11.6 * M); g.stroke(); }
  for (const [cx, cy] of [[11, 8.5], [15, 9.5]]) { g.beginPath(); g.arc(x0 + cx * M, y0 + cy * M, 26, 0, Math.PI * 2); g.stroke(); }
  // Furniture (thin)
  g.strokeStyle = '#666';
  g.strokeRect(x0 + 2 * M, y0 + 2 * M, 3 * M, 1.6 * M);
  g.strokeRect(x0 + 28 * M, y0 + 2 * M, 5 * M, 2.4 * M);
  for (let k = 0; k < 4; k++) g.strokeRect(x0 + (10 + k * 1.8) * M, y0 + 15 * M, 1.2 * M, 2 * M);
  // Labels
  g.fillStyle = '#222';
  g.font = '22px "IBM Plex Sans Arabic", Tahoma, sans-serif';
  g.textAlign = 'center';
  const label = (s: string, x: number, y: number) => g.fillText(s, x0 + x * M, y0 + y * M);
  label('إدارة', 4, 5); label('قاعة اجتماعات', 13, 3); label('مكتب', 22, 3); label('قاعة عرض', 31, 8);
  label('أرشيف', 4, 17); label('مطالعة', 13, 18); label('كافتيريا', 21, 18); label('فناء', 13, 9.3); label('ردهة', 22, 12.2);
  // Dimension line (thin) + text
  const dy = y0 + 22 * M + 60;
  g.strokeStyle = '#333'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x0, dy); g.lineTo(x0 + 36 * M, dy); g.moveTo(x0, dy - 10); g.lineTo(x0, dy + 10); g.moveTo(x0 + 36 * M, dy - 10); g.lineTo(x0 + 36 * M, dy + 10); g.stroke();
  g.fillText('36.00 m', x0 + 18 * M, dy - 10);
  g.textAlign = 'right';
  g.font = '26px "IBM Plex Sans Arabic", Tahoma, sans-serif';
  g.fillText('مسقط أرضي — مثال تدريبي', W - 40, 60);
  // North arrow
  g.beginPath(); g.moveTo(1300, 860); g.lineTo(1290, 900); g.lineTo(1310, 900); g.closePath(); g.fillStyle = '#222'; g.fill();
  g.font = '20px sans-serif'; g.textAlign = 'center'; g.fillText('N', 1300, 850);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

/** Known facts about the sample, used for honest "measured vs estimated" demos. */
export const SAMPLE_FACTS = { widthM: 36, pxPerM: 30, originPx: [160, 140] as [number, number] };
