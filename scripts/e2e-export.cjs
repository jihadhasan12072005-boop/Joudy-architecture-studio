// Export integrity on desktop and phones: create a design, view it, export, then open & inspect each file.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const { inspect } = require('./inspect-exports.cjs');
const BASE = process.env.BASE || 'http://localhost:4173/';
const OUT = process.env.OUT || path.join(__dirname, '..', 'test-results', 'export');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };
const MIN_CONTENT = 3; // % of pixels that must differ from the background

const PROFILES = [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['iphone', { ...devices['iPhone 13'] }],
  ['android', { ...devices['Pixel 7'] }],
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, opts] of PROFILES) {
    console.log(`\n=== ${name}`);
    const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const save = async (trigger, file) => {
      await trigger();
      const dlg = page.getByRole('dialog', { name: /تصدير/ });
      await dlg.waitFor({ timeout: 30000 });
      const img = dlg.locator('img.export-preview');
      const err = dlg.locator('.note.danger');
      await Promise.race([img.waitFor({ timeout: 40000 }), err.waitFor({ timeout: 40000 }), dlg.getByText('لا توجد معاينة صورية').waitFor({ timeout: 40000 })]).catch(() => {});
      if (await err.count()) { const t = await err.innerText(); await dlg.getByRole('button', { name: 'إغلاق' }).last().click(); throw new Error('export refused: ' + t); }
      if (await img.count()) {
        const pc = await img.evaluate(async (el) => { await el.decode(); const c = document.createElement('canvas'); c.width = 120; c.height = 90; const g = c.getContext('2d'); g.drawImage(el, 0, 0, 120, 90); const d = g.getImageData(0, 0, 120, 90).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 40) n++; return (100 * n) / (120 * 90); });
        ok(pc > 1, `${file}: in-app preview shows the design before download (${pc.toFixed(1)}% content)`);
      }
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlg.getByRole('button', { name: 'تنزيل الملف' }).click()]);
      const p = path.join(OUT, `${name}-${file}`);
      await d.saveAs(p);
      return p;
    };
    const check = (p, label) => {
      const r = inspect(p);
      const good = r.type === 'glb' ? r.meshes > 0 && r.triangles > 0 : r.type === 'json' ? r.masses > 0 : r.contentPct > MIN_CONTENT;
      ok(good, `${label}: ${JSON.stringify(r)}`);
    };
    await page.goto(BASE);
    await page.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();

    // ---- Lab
    await page.goto(BASE + '#/lab');
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'إغلاق' }).click();
    await page.getByRole('button', { name: /جرّبي بمثال جاهز/ }).click();
    await page.waitForURL(/#\/lab\/.+/);
    await page.getByText('نتيجة التعرّف').waitFor({ timeout: 20000 });
    await page.goto(page.url().replace(/\?.*$/, '') + '?tab=m3d');
    await page.locator('.viewer3d canvas').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `${name}-lab-3d-screen.png`) });
    const exportArea = page.locator('.lab-side');
    for (const [btn, ext] of [['PNG', 'png'], ['PDF', 'pdf'], ['GLB', 'glb']]) {
      try { check(await save(() => exportArea.getByRole('button', { name: btn, exact: true }).first().click(), `lab-3d.${ext}`), `lab 3D ${btn}`); }
      catch (e) { ok(false, `lab 3D ${btn}: ${e.message.split('\n')[0]}`); }
    }
    await page.goto(page.url().replace(/\?.*$/, '') + '?tab=board');
    await page.locator('.viewer3d canvas').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'إنشاء اللوحة' }).click();
    await page.locator('img.board-preview').waitFor({ timeout: 30000 }).catch(() => {});
    for (const [btn, ext] of [['PNG', 'png'], ['PDF', 'pdf']]) {
      try { check(await save(() => page.locator('.lab-side').getByRole('button', { name: btn, exact: true }).first().click(), `board.${ext}`), `lab board ${btn}`); }
      catch (e) { ok(false, `lab board ${btn}: ${e.message.split('\n')[0]}`); }
    }

    // Layout must fit the screen on every lab tab (a wider layout makes the page look empty on phones)
    if (name !== 'desktop') {
      const base = page.url().replace(/\?.*$/, '');
      for (const t of ['plan', 'm3d', 'm2d', 'zoning', 'variants', 'sections', 'analysis', 'board']) {
        await page.goto(base + '?tab=' + t);
        await page.waitForTimeout(700);
        const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(o <= 1, `lab tab ${t}: fits the phone screen (overflow ${o}px)`);
      }
    }
    // ---- Editor
    await page.goto(BASE + '#/editor');
    await page.getByRole('button', { name: 'جرّبي المثال الجاهز' }).click();
    await page.waitForURL(/#\/editor\/.+/);
    await page.locator('.editor-canvas canvas').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    if (name !== 'desktop') ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'editor fits the phone screen');
    for (const v of ['مسقط علوي', 'منظور 3D']) {
      await page.getByRole('tab', { name: v }).click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${name}-editor-${v === 'منظور 3D' ? '3d' : 'plan'}-screen.png`) });
      try { check(await save(() => page.getByRole('button', { name: 'صورة PNG' }).click(), `editor-${v === 'منظور 3D' ? '3d' : 'plan'}.png`), `editor PNG (${v})`); }
      catch (e) { ok(false, `editor PNG (${v}): ${e.message.split('\n')[0]}`); }
    }
    try { check(await save(() => page.getByRole('button', { name: 'PDF', exact: true }).click(), 'editor-3d.pdf'), 'editor PDF'); } catch (e) { ok(false, `editor PDF: ${e.message.split('\n')[0]}`); }
    try { check(await save(() => page.getByRole('button', { name: 'GLB', exact: true }).click(), 'editor.glb'), 'editor GLB'); } catch (e) { ok(false, `editor GLB: ${e.message.split('\n')[0]}`); }
    try { check(await save(() => page.getByRole('button', { name: 'ملف المشروع', exact: true }).click(), 'editor.joudy-massing.json'), 'editor project file'); } catch (e) { ok(false, `editor project file: ${e.message.split('\n')[0]}`); }
    // Camera moved far away from the design → export must still contain the model (auto-framing)
    await page.evaluate(() => { const ed = window.__massEditor; const c = ed.camera; c.position.set(900, 40, 900); c.lookAt(1200, 0, 1200); ed.invalidate(); });
    await page.waitForTimeout(300);
    try { check(await save(() => page.getByRole('button', { name: 'صورة PNG' }).click(), 'editor-camera-away.png'), 'editor PNG with camera pointed away (auto-framed)'); } catch (e) { ok(false, `camera away: ${e.message.split('\n')[0]}`); }
    // Empty model → exports disabled, no empty file possible
    await page.goto(BASE + '#/editor');
    await page.getByRole('button', { name: 'نموذج جديد' }).click();
    await page.waitForURL(/#\/editor\/.+/);
    await page.locator('.editor-canvas canvas').waitFor({ timeout: 20000 });
    ok(await page.getByRole('button', { name: 'صورة PNG' }).isDisabled() && await page.getByRole('button', { name: 'GLB', exact: true }).isDisabled(), 'empty design: image/model export buttons disabled (no blank file possible)');
    const relevant = errors.filter((e) => !/GPU stall|swiftshader|Failed to load resource/i.test(e));
    ok(relevant.length === 0, `no errors ${relevant.length ? JSON.stringify(relevant.slice(0, 4)) : ''}`);
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
