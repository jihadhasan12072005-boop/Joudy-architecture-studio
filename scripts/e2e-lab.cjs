// End-to-end test of the Massing Lab on the production build.
// Usage: npm run build && (npx vite preview --port 4173 &) && NODE_PATH=$(npm root -g) node scripts/e2e-lab.cjs
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:4173/';
const OUT = process.env.OUT || path.join(__dirname, '..', 'test-results', 'lab');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };
const vis = (l, t = 15000) => l.first().waitFor({ state: 'visible', timeout: t }).then(() => true, () => false);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);
  await page.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();

  console.log('Dashboard entry point');
  ok(await vis(page.locator('.lab-cta-card')), 'dashboard shows "upload architectural plan" call-to-action');
  await page.locator('.lab-cta-card').getByRole('link', { name: /ارفعي مسقطاً معمارياً/ }).click();

  console.log('Tutorial');
  ok(await vis(page.getByRole('dialog', { name: /كيف أحوّل مسقطي إلى كتلة/ })), 'interactive tutorial opens on first visit');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /التالي/ }).click();
  ok(await vis(page.getByText('الخطوة 6: عدّلي وصدّري')), 'tutorial reaches step 6');
  await page.getByRole('button', { name: 'ابدئي الآن' }).click();
  await page.screenshot({ path: path.join(OUT, '01-lab-home.png') });

  console.log('Sample plan → recognition');
  await page.getByRole('button', { name: /جرّبي بمثال جاهز/ }).click();
  await page.waitForURL(/#\/lab\/.+/);
  ok(await vis(page.getByText('نتيجة التعرّف')), 'study opens on the recognition step');
  await page.locator('canvas.plan-canvas').waitFor();
  await page.waitForTimeout(500);
  const spacesText = await page.locator('.result .stat').first().locator('.v').innerText();
  const nSpaces = Number(spacesText.trim());
  ok(nSpaces >= 7 && nSpaces <= 9, `sample plan: ${nSpaces} spaces detected (expected 8: 7 rooms incl. lobby/café + courtyard)`);
  const courtyards = Number((await page.locator('.result .stat').nth(1).locator('.v').innerText()).trim());
  ok(courtyards === 1, `sample plan: ${courtyards} courtyard auto-suggested (expected 1)`);
  await page.screenshot({ path: path.join(OUT, '02-recognition-estimated.png') });

  console.log('Scale: measured from overall width');
  await page.getByLabel('أو: العرض الكلي للمبنى (أفقياً)').fill('36');
  await page.locator('section', { hasText: 'المقياس' }).getByRole('button', { name: 'اعتماد', exact: true }).click();
  ok(await vis(page.getByText(/مقاس: 1 بكسل/)), 'scale marked as measured');
  const areaTxt = (await page.locator('.result .stat').nth(2).locator('.v').innerText()).replace(/,/g, '');
  const area = Number((areaTxt.match(/[\d.]+/) || ['NaN'])[0]);
  // True footprint of the sample: 36×22 − 12×8 = 696 m² (building incl. courtyard)
  ok(Math.abs(area - 696) / 696 < 0.04, `footprint area ${area} m² vs true 696 m² (±4%)`);

  console.log('Name a space, mark an entrance');
  await page.locator('table.t tbody tr').first().click();
  await page.getByLabel('الاسم', { exact: true }).fill('الإدارة');
  await page.getByLabel('النطاق الوظيفي').selectOption('private');
  ok(await vis(page.locator('table.t tbody tr').first().getByText('الإدارة')), 'space renamed and zoned');
  await page.getByRole('tab', { name: 'تحديد مدخل' }).click();
  const cv = page.locator('canvas.plan-canvas');
  const box = await cv.boundingBox();
  const dims = await cv.evaluate((c) => [c.width, c.height]);
  // Sample entrance at plan (x=24-t m, y=18 m) → px in the 1400×1000 source = (160+23.85*30, 140+18*30); working scale = 1100/1400
  const k = dims[0] / 1400;
  await page.mouse.click(box.x + ((160 + 23.8 * 30) * k / dims[0]) * box.width, box.y + ((140 + 18 * 30) * k / dims[1]) * box.height);
  await page.getByRole('button', { name: /النتيجة مقبولة/ }).click();

  console.log('3D massing');
  await page.locator('.viewer3d canvas').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  ok(await page.locator('.viewer3d canvas').count() >= 1, 'WebGL viewer rendered');
  const nonBlank = await page.locator('.viewer3d canvas').first().evaluate((c) => {
    const g = document.createElement('canvas'); g.width = 60; g.height = 40;
    const x = g.getContext('2d'); x.drawImage(c, 0, 0, 60, 40);
    const d = x.getImageData(0, 0, 60, 40).data; const set = new Set();
    for (let i = 0; i < d.length; i += 16) set.add(d[i] >> 4 << 8 | d[i + 1] >> 4);
    return set.size;
  });
  ok(nonBlank > 4, `3D view is not blank (${nonBlank} colour buckets)`);
  await page.getByRole('button', { name: 'أكسونومتري' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '03-massing-3d-volumetric.png') });
  // per-space floors
  await page.getByRole('button', { name: /زيادة طوابق/ }).first().click();
  await page.getByRole('button', { name: /زيادة طوابق/ }).first().click();
  await page.waitForTimeout(400);
  const vols = Number((await page.locator('.result .stat').nth(1).locator('.v').innerText()).trim());
  ok(vols >= 2, `volumetric study with different heights → ${vols} volumes`);
  await page.getByRole('tab', { name: 'كتلة مفككة' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '04-massing-3d-exploded.png') });
  await page.getByRole('tab', { name: 'كتلة بسيطة' }).click();
  await page.getByLabel('دراسة الظلال', { exact: false }).check();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '05-massing-3d-block-shadows.png') });
  await page.getByRole('tab', { name: 'دراسة حجمية' }).click();
  for (const [label, ext] of [['GLB', '.glb'], ['OBJ', '.obj'], ['PNG', '.png'], ['PDF', '.pdf']]) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('.lab-side').getByRole('button', { name: label, exact: true }).first().click()]);
    const p = path.join(OUT, 'export-3d' + ext);
    await dl.saveAs(p);
    const size = fs.statSync(p).size;
    const head = fs.readFileSync(p).subarray(0, 5).toString('latin1');
    const valid = ext === '.glb' ? head.startsWith('glTF') : ext === '.pdf' ? head.startsWith('%PDF') : ext === '.png' ? head.includes('PNG') : head.includes('#') || head.includes('o ') || head.includes('v ');
    ok(size > 500 && valid, `3D export ${label}: ${size} bytes, valid header`);
  }

  console.log('2D massing plan');
  await page.getByRole('button', { name: 'مخطط الكتلة 2D' }).click();
  ok(await vis(page.locator('svg[aria-label="مخطط الكتلة ثنائي الأبعاد"] path')), '2D massing diagram drawn');
  ok(await vis(page.locator('svg[aria-label="مخطط الكتلة ثنائي الأبعاد"]').getByText('فناء')), '2D diagram labels the courtyard');
  await page.locator('.card.tight').screenshot({ path: path.join(OUT, '06-massing-2d.png') });
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).first().click()]);
  await d2.saveAs(path.join(OUT, 'massing-2d.pdf'));
  ok(fs.readFileSync(path.join(OUT, 'massing-2d.pdf')).subarray(0, 4).toString() === '%PDF', '2D diagram exports to PDF');

  console.log('Zoning, circulation, bubble');
  await page.getByRole('button', { name: 'التنطيق والحركة' }).click();
  ok(await vis(page.locator('svg[aria-label="مخطط التنطيق الوظيفي"]')), 'zoning diagram drawn');
  ok(await vis(page.getByText('أبعد مسافة مشي من مدخل')), 'walking distance from the marked entrance computed');
  ok(await page.locator('svg[aria-label="مخطط العلاقات الوظيفية"] circle').count() >= 6, 'bubble diagram built from detected spaces');
  await page.screenshot({ path: path.join(OUT, '07-zoning-circulation.png'), fullPage: true });

  console.log('Variants');
  await page.getByRole('button', { name: 'بدائل الكتلة' }).click();
  await page.locator('.viewer3d canvas').nth(3).waitFor({ timeout: 20000 });
  ok(await page.getByRole('button', { name: 'اعتماد هذا البديل' }).count() >= 4, 'at least 4 massing alternatives');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '08-variants.png'), fullPage: true });
  await page.getByRole('button', { name: 'اعتماد هذا البديل' }).nth(3).click();
  ok(await vis(page.getByText(/اعتُمد بديل/)), 'variant applied');

  console.log('Sections & elevations');
  await page.getByRole('button', { name: 'مقاطع وواجهات' }).click();
  ok(await vis(page.locator('svg[aria-label*="الواجهة"]')), 'elevation drawn');
  ok(await vis(page.locator('svg[aria-label^="مقطع"]')), 'section drawn');
  await page.screenshot({ path: path.join(OUT, '09-sections.png'), fullPage: true });

  console.log('Analysis');
  await page.getByRole('button', { name: 'تحليل المسقط' }).click();
  ok(await vis(page.getByText('جدول الفراغات المقاسة')), 'analysis table shown');
  ok(await vis(page.getByText('مساحة البصمة المبنية')), 'metrics shown');
  await page.screenshot({ path: path.join(OUT, '10-analysis.png'), fullPage: true });

  console.log('Board');
  await page.getByRole('button', { name: 'لوحة العرض والتصدير' }).click();
  await page.locator('.viewer3d canvas').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'إنشاء اللوحة' }).click();
  ok(await vis(page.locator('img.board-preview'), 30000), 'presentation board composed');
  const [db] = await Promise.all([page.waitForEvent('download'), page.locator('.lab-side').getByRole('button', { name: 'PDF', exact: true }).first().click()]);
  await db.saveAs(path.join(OUT, 'board.pdf'));
  ok(fs.statSync(path.join(OUT, 'board.pdf')).size > 50000, 'board PDF downloaded');
  const [dbp] = await Promise.all([page.waitForEvent('download'), page.locator('.lab-side').getByRole('button', { name: 'PNG', exact: true }).first().click()]);
  await dbp.saveAs(path.join(OUT, 'board.png'));

  console.log('Persistence');
  const url = page.url();
  await page.reload();
  await page.goto(url.replace(/\?.*$/, '') + '?tab=plan');
  ok(await vis(page.locator('table.t tbody tr').first().getByText('الإدارة')), 'study settings survive reload');
  ok(await vis(page.getByText(/مقاس: 1 بكسل/)), 'scale survives reload');

  console.log('PDF plan upload');
  const pdfPage = await ctx.newPage();
  const png = fs.readFileSync(path.join(OUT, '02-recognition-estimated.png'));
  void png;
  await pdfPage.goto(BASE);
  const sampleDataUrl = await page.evaluate(async () => {
    const m = await import('/src/lab/io.ts').catch(() => null);
    return m ? null : null;
  }).catch(() => null);
  void sampleDataUrl;
  // Build a PDF that contains the sample plan image (rendered by the app's own sample generator via the lab page)
  const samplePng = await page.evaluate(async () => {
    const c = document.querySelector('canvas.plan-canvas');
    return c ? c.toDataURL('image/png') : null;
  });
  await pdfPage.setContent(`<html><body style="margin:0"><img src="${samplePng}" style="width:100%"></body></html>`);
  await pdfPage.pdf({ path: path.join(OUT, 'plan.pdf'), format: 'A4', landscape: true });
  await pdfPage.close();
  await page.goto(BASE + '#/lab');
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(path.join(OUT, 'plan.pdf'));
  await page.waitForURL(/#\/lab\/.+/);
  ok(await vis(page.getByText('نتيجة التعرّف'), 30000), 'PDF plan opened');
  await page.waitForTimeout(1500);
  const pdfSpaces = Number((await page.locator('.result .stat').first().locator('.v').innerText()).trim());
  ok(pdfSpaces >= 5, `PDF plan: ${pdfSpaces} spaces detected`);
  await page.screenshot({ path: path.join(OUT, '11-pdf-plan.png') });

  console.log('Backup includes studies');
  await page.goto(BASE + '#/settings');
  const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /تصدير نسخة احتياطية/ }).click()]);
  await bk.saveAs(path.join(OUT, 'backup.zip'));
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();
  await p2.goto(BASE + '#/settings');
  await p2.locator('input[type=file][accept*=zip]').setInputFiles(path.join(OUT, 'backup.zip'));
  await p2.getByRole('button', { name: 'دمج مع بياناتي' }).click();
  await p2.waitForTimeout(2500);
  await p2.goto(BASE + '#/lab');
  await p2.getByRole('dialog').waitFor();
  await p2.getByRole('button', { name: 'إغلاق' }).click();
  ok(await vis(p2.getByText('مثال تدريبي — مبنى بفناء')), 'massing studies restored from backup on another device');
  await ctx2.close();

  console.log('Phone');
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const ph = await phone.newPage();
  await ph.goto(BASE);
  await ph.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();
  await ph.goto(BASE + '#/lab');
  await ph.getByRole('dialog').waitFor();
  await ph.getByRole('button', { name: 'إغلاق' }).click();
  await ph.getByRole('button', { name: /جرّبي بمثال جاهز/ }).click();
  await ph.waitForURL(/#\/lab\/.+/);
  await ph.getByText('نتيجة التعرّف').waitFor({ timeout: 20000 });
  const overflow = await ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `phone: no horizontal scroll in lab (${overflow}px)`);
  await ph.screenshot({ path: path.join(OUT, '12-phone-lab.png'), fullPage: false });
  await ph.goto(ph.url().replace(/\?.*$/, '') + '?tab=m3d');
  await ph.locator('.viewer3d canvas').waitFor({ timeout: 20000 });
  await ph.waitForTimeout(800);
  await ph.screenshot({ path: path.join(OUT, '13-phone-3d.png'), fullPage: false });
  await phone.close();

  const relevant = errors.filter((e) => !/Failed to load resource|net::|WebGL|GPU stall|swiftshader/i.test(e));
  ok(relevant.length === 0, `no unexpected errors ${relevant.length ? JSON.stringify(relevant.slice(0, 4)) : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
