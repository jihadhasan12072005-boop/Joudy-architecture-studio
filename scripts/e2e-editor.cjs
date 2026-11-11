// Full user cycle of the massing editor on the production build, with real mouse & keyboard.
// Usage: npm run build && (npx vite preview --port 4173 &) && NODE_PATH=$(npm root -g) node scripts/e2e-editor.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const BASE = process.env.BASE || 'http://localhost:4173/';
const OUT = process.env.OUT || path.join(__dirname, '..', 'test-results', 'editor');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };
const vis = (l, t = 10000) => l.first().waitFor({ state: 'visible', timeout: t }).then(() => true, () => false);

function png(w, h) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  const ink = (x, y) => { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = raw[o + 1] = raw[o + 2] = 30; };
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const rect = (x0, y0, x1, y1, t) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x < x0 + t || x >= x1 - t || y < y0 + t || y >= y1 - t) ink(x, y); };
  rect(100, 100, 700, 500, 8); rect(700, 200, 900, 500, 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}


async function confirmDownload(page, triggerClick) {
  await triggerClick();
  const dlg = page.getByRole('dialog', { name: /تصدير/ });
  try { await dlg.getByRole('button', { name: 'تنزيل الملف' }).waitFor({ timeout: 40000 }); }
  catch (e) { console.log('   DIALOG STATE:', (await page.locator('[role=dialog]').allInnerTexts()).join(' | ').slice(0, 400)); throw e; }
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlg.getByRole('button', { name: 'تنزيل الملف' }).click()]);
  return d;
}

(async () => {
  const plan = path.join(OUT, 'plan.png');
  fs.writeFileSync(plan, png(1000, 600));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const model = () => page.evaluate(() => window.__massEditor.model);
  const scr = (x, y, z) => page.evaluate(([a, b, c]) => window.__massEditor.screenOf(a, b, c), [x, y, z]);
  const canvasBox = async () => page.locator('.editor-canvas canvas').boundingBox();

  await page.goto(BASE);
  await page.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();
  await page.locator('.sidebar').getByRole('link', { name: 'محرر الكتل' }).click();
  ok(await vis(page.getByRole('heading', { name: /صمّمي الكتل بنفسك/ })), 'editor home with the 6-step workflow');

  console.log('1. New model + upload plan image');
  await page.getByRole('button', { name: 'نموذج جديد' }).click();
  await page.waitForURL(/#\/editor\/.+/);
  await page.locator('.editor-canvas canvas').waitFor({ timeout: 20000 });
  await page.locator('input[type=file][accept*="image"]').setInputFiles(plan);
  ok(await vis(page.getByText('الأبعاد تقريبية — لم يُضبط المقياس')), 'image uploaded, dimensions flagged as approximate');
  await page.getByLabel('الشفافية').fill('0.4');
  ok((await model()).reference.opacity === 0.4, 'image opacity adjustable');
  await page.waitForTimeout(500);

  console.log('2. Calibrate scale from a known dimension');
  // The image is 40 m wide by default → 1000 px image: wall from px 100 to 900 = 32 m (approx). Tell the app it is 24 m.
  await page.getByRole('button', { name: /ضبط المقياس من بُعد معروف/ }).click();
  const ref = (await model()).reference;
  const pxToWorld = (px, py) => [ref.x - ref.widthM / 2 + (px / 1000) * ref.widthM, ref.z - (ref.widthM * ref.aspect) / 2 + (py / 600) * ref.widthM * ref.aspect];
  const [ax, az] = pxToWorld(100, 100), [bx, bz] = pxToWorld(900, 100);
  const A = await scr(ax, 0, az), B = await scr(bx, 0, bz);
  await page.mouse.click(A.x, A.y); await page.mouse.click(B.x, B.y);
  await page.getByLabel('الطول الحقيقي').fill('24');
  await page.getByRole('button', { name: 'اعتماد' }).click();
  ok(await vis(page.getByText('الأبعاد مقاسة', { exact: true })), 'scale calibrated → dimensions marked as measured');
  const r2 = (await model()).reference;
  ok(Math.abs(r2.widthM - 30) < 0.2, `image width rescaled to ${r2.widthM.toFixed(2)} m (expected 30 m: 1000 px where 800 px = 24 m)`);
  await page.waitForTimeout(300);

  console.log('3. Draw two masses (rectangle + free polygon)');
  const W = (px, py) => { const rr = r2; return [rr.x - rr.widthM / 2 + (px / 1000) * rr.widthM, rr.z - (rr.widthM * rr.aspect) / 2 + (py / 600) * rr.widthM * rr.aspect]; };
  await page.keyboard.press('r');
  let p1 = await scr(...[W(100, 100)[0], 0, W(100, 100)[1]]), p2 = await scr(W(700, 500)[0], 0, W(700, 500)[1]);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, { steps: 4 }); await page.mouse.move(p2.x, p2.y, { steps: 4 }); await page.mouse.up();
  let m = await model();
  ok(m.masses.length === 1, 'rectangle mass created');
  const area1 = m.masses[0].outline.reduce((s, p, i, r) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2;
  ok(Math.abs(Math.abs(area1) - 18 * 12) < 3, `rectangle traced over the plan: ${Math.abs(area1).toFixed(1)} m² (expected 18 × 12 = 216)`);
  await page.keyboard.press('p');
  for (const [px, py] of [[700, 200], [900, 200], [900, 500], [800, 500], [800, 350], [700, 350]]) {
    const s = await scr(W(px, py)[0], 0, W(px, py)[1]);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(350);
  }
  await page.keyboard.press('Enter');
  m = await model();
  ok(m.masses.length === 2 && m.masses[1].outline.length === 6, `free-form (irregular) mass created with ${m.masses[1]?.outline.length} points`);
  await page.screenshot({ path: path.join(OUT, '01-plan-two-masses.png') });

  console.log('4. Edit dimensions & heights by numbers');
  await page.keyboard.press('v');
  const c1 = await scr(m.masses[0].x, 0, m.masses[0].z);
  await page.mouse.click(c1.x, c1.y);
  ok(await vis(page.getByLabel('اسم الكتلة')), 'mass selected → properties panel');
  await page.getByLabel('اسم الكتلة').fill('الجناح الإداري');
  await page.getByLabel('الطول (أفقي)').fill('20');
  await page.getByLabel('عدد الطوابق').fill('4');
  await page.waitForTimeout(300);
  m = await model();
  const b0 = m.masses[0].outline; const xs = b0.map((p) => p[0]);
  ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 20) < 0.01, 'length set to exactly 20 m');
  ok(Math.abs(m.masses[0].height - 12.8) < 0.01, `4 floors → height ${m.masses[0].height} m`);

  console.log('5. Move, rotate, duplicate, delete');
  const before = m.masses[0].x;
  const s0 = await scr(m.masses[0].x, 0, m.masses[0].z);
  await page.mouse.move(s0.x, s0.y); await page.mouse.down(); await page.mouse.move(s0.x + 40, s0.y, { steps: 5 }); await page.mouse.up();
  m = await model();
  ok(m.masses[0].x > before + 0.5, `mass moved by drag (${(m.masses[0].x - before).toFixed(2)} m)`);
  await page.keyboard.press(']');
  m = await model();
  ok(Math.abs(m.masses[0].rot - 5) < 0.01, 'rotated with ] key (5°)');
  await page.keyboard.press('Control+d');
  ok((await model()).masses.length === 3, 'duplicated with Ctrl+D');
  await page.keyboard.press('Delete');
  ok((await model()).masses.length === 2, 'deleted with Delete');
  await page.keyboard.press('Control+z');
  ok((await model()).masses.length === 3, 'Ctrl+Z restores the deleted copy');
  await page.keyboard.press('Control+y');
  ok((await model()).masses.length === 2, 'Ctrl+Y redoes the delete');

  console.log('6. Resize by dragging a handle');
  m = await model();
  { const c = await scr(m.masses[0].x, 0, m.masses[0].z); await page.mouse.click(c.x, c.y); }
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'dbg-06-selected.png') });
  const ma = m.masses[0];
  const xsA = ma.outline.map((p) => p[0]), zsA = ma.outline.map((p) => p[1]);
  const sideLocal = [Math.max(...xsA), (Math.min(...zsA) + Math.max(...zsA)) / 2];
  const rr = (ma.rot * Math.PI) / 180;
  const sideW = [ma.x + sideLocal[0] * Math.cos(rr) - sideLocal[1] * Math.sin(rr), ma.z + sideLocal[0] * Math.sin(rr) + sideLocal[1] * Math.cos(rr)];
  const hs = await scr(sideW[0], 0.3, sideW[1]);
  await page.mouse.move(hs.x, hs.y); await page.mouse.down(); await page.mouse.move(hs.x + 60, hs.y, { steps: 6 }); await page.mouse.up();
  m = await model();
  const xsB = m.masses[0].outline.map((p) => p[0]);
  ok(Math.max(...xsB) - Math.min(...xsB) > 21, `side handle drag lengthened the mass to ${(Math.max(...xsB) - Math.min(...xsB)).toFixed(2)} m`);

  console.log('7. Edit the boundary: move a vertex, curve an edge, round corners');
  const second = m.masses[1];
  await page.keyboard.press('Escape');
  await page.locator('.mass-row', { hasText: 'كتلة 2' }).click(); // overlapping masses: pick from the list
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'dbg-07-edit.png') });
  console.log('   selection debug:', await page.evaluate(() => JSON.stringify({ n: window.__massEditor.model.masses.length })));
  const v0 = second.outline[0];
  const vw = [second.x + v0[0], second.z + v0[1]];
  const vs = await scr(vw[0], 0.3, vw[1]);
  await page.mouse.move(vs.x, vs.y); await page.mouse.down(); await page.mouse.move(vs.x - 25, vs.y - 25, { steps: 5 }); await page.mouse.up();
  m = await model();
  const nv = m.masses[1].outline[0];
  ok(Math.hypot(nv[0] - v0[0], nv[1] - v0[1]) > 0.5, 'vertex dragged to a new position');
  // curve edge 1 (top edge between vertex 0 and 1) via its midpoint handle
  const e0 = m.masses[1].outline[0], e1 = m.masses[1].outline[1];
  const mid = [m.masses[1].x + (e0[0] + e1[0]) / 2, m.masses[1].z + (e0[1] + e1[1]) / 2];
  const ms = await scr(mid[0], 0.3, mid[1]);
  await page.mouse.move(ms.x, ms.y); await page.mouse.down(); await page.mouse.move(ms.x, ms.y - 45, { steps: 6 }); await page.mouse.up();
  m = await model();
  ok(Math.abs(m.masses[1].bulge[0]) > 0.5, `edge curved (sagitta ${m.masses[1].bulge[0]} m)`);
  await page.getByLabel('تدوير كل الزوايا (نصف القطر)').fill('1.2');
  m = await model();
  ok(m.masses[1].radius.every((r) => r === 1.2), 'all corners rounded to 1.2 m');

  console.log('8. Roofs: shed then barrel (curved) with rise & direction');
  await page.getByLabel('نوع السقف').selectOption('shed');
  await page.getByLabel('ارتفاع السقف فوق الطنف').fill('3');
  await page.getByRole('button', { name: 'ق', exact: true }).click();
  m = await model();
  ok(m.masses[1].roof.type === 'shed' && m.masses[1].roof.rise === 3 && m.masses[1].roof.dir === 90, 'shed roof, 3 m, sloping east');
  await page.getByLabel('نوع السقف').selectOption('barrel');
  ok((await model()).masses[1].roof.type === 'barrel', 'curved barrel roof applied');

  console.log('9. Void (courtyard) only where drawn, then close it');
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  m = await model();
  const big = m.masses[0];
  for (const [dx, dz] of [[-3, -2], [3, -2], [3, 2], [-3, 2]]) {
    const s = await scr(big.x + dx, 0, big.z + dz);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(350);
  }
  await page.keyboard.press('Enter');
  m = await model();
  ok(m.masses.find((x) => x.id === big.id)?.holes.length === 1, 'void cut into the selected mass');
  await page.keyboard.press('v');
  const bs = await scr(big.x + 6, 0, big.z);
  await page.mouse.click(bs.x, bs.y);
  await page.getByRole('button', { name: 'إغلاق الفراغ' }).click();
  ok((await model()).masses.find((x) => x.id === big.id)?.holes.length === 0, 'void closed again (no courtyard imposed)');
  await page.keyboard.press('Control+z');
  ok((await model()).masses.find((x) => x.id === big.id)?.holes.length === 1, 'undo brings the void back');

  console.log('10. Views: 3D perspective, height by drag, elevations');
  await page.keyboard.press('2');
  await page.waitForTimeout(500);
  m = await model();
  const hm = m.masses[0];
  const hb = hm.outline; const hx = hb.map((p) => p[0]), hz = hb.map((p) => p[1]);
  const lc = [(Math.min(...hx) + Math.max(...hx)) / 2, (Math.min(...hz) + Math.max(...hz)) / 2];
  const rot = (hm.rot * Math.PI) / 180;
  const wc = [hm.x + lc[0] * Math.cos(rot) - lc[1] * Math.sin(rot), hm.z + lc[0] * Math.sin(rot) + lc[1] * Math.cos(rot)];
  const hh = await scr(wc[0], hm.base + hm.height + 0.6, wc[1]);
  await page.mouse.move(hh.x, hh.y); await page.mouse.down(); await page.mouse.move(hh.x, hh.y - 60, { steps: 6 }); await page.mouse.up();
  m = await model();
  ok(m.masses[0].height > hm.height + 1, `height dragged in 3D: ${hm.height} → ${m.masses[0].height.toFixed(2)} m`);
  await page.screenshot({ path: path.join(OUT, '02-perspective.png') });
  await page.getByRole('tab', { name: 'واجهة جنوبية' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-south-elevation.png') });
  await page.getByRole('tab', { name: 'مسقط علوي' }).click();

  console.log('11. Save a version, reload, verify everything persisted');
  await page.keyboard.press('Control+s');
  ok(await vis(page.getByText(/حُفظت «نسخة 1/)), 'version saved (Ctrl+S)');
  const snapshot = await model();
  await page.waitForTimeout(1200); // autosave debounce
  await page.reload();
  await page.locator('.editor-canvas canvas').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const after = await model();
  const sameMasses = JSON.stringify(after.masses) === JSON.stringify(snapshot.masses);
  ok(sameMasses, 'after reload: all masses identical (positions, sizes, heights, vertices, curves, corners, roofs, voids)');
  ok(after.masses[0].name === 'الجناح الإداري' && after.masses[1].roof.type === 'barrel' && after.masses[1].radius[0] === 1.2, 'names, roof and corner radius persisted');
  ok(after.measured && Math.abs(after.reference.widthM - 30) < 0.2 && after.reference.opacity === 0.4, 'scale and image settings persisted');
  ok(after.versions.length === 1, 'saved version listed after reload');
  await page.getByRole('button', { name: /النسخ \(1\)/ }).click();
  ok(await vis(page.getByRole('button', { name: 'فتح للتعديل' })), 'version can be opened for editing');
  await page.keyboard.press('Escape');

  console.log('12. Export: PNG, GLB, re-editable project file → reopen');
  const dl = async (name, file) => {
    const d = await confirmDownload(page, () => page.getByRole('button', { name, exact: true }).click());
    const p = path.join(OUT, file); await d.saveAs(p); return p;
  };
  const pngP = await dl('صورة PNG', 'export.png');
  ok(fs.readFileSync(pngP).subarray(1, 4).toString() === 'PNG' && fs.statSync(pngP).size > 20000, 'PNG export');
  const glbP = await dl('GLB', 'export.glb');
  ok(fs.readFileSync(glbP).subarray(0, 4).toString() === 'glTF', `GLB export (${fs.statSync(glbP).size} bytes)`);
  const jsonP = await dl('ملف المشروع', 'project.joudy-massing.json');
  const file = JSON.parse(fs.readFileSync(jsonP, 'utf8'));
  ok(file.format === 'joudy-massing-model' && file.model.masses.length === 2 && file.referenceImage?.startsWith('data:image/png'), 'project file contains masses + reference image');
  await page.goto(BASE + '#/editor');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(jsonP);
  await page.waitForURL(/#\/editor\/.+/);
  await page.locator('.editor-canvas canvas').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const imported = await model();
  ok(JSON.stringify(imported.masses) === JSON.stringify(snapshot.masses) && imported.reference, 'project file re-opened for editing with identical masses and image');

  console.log('13. Ready-made example + merge');
  await page.goto(BASE + '#/editor');
  await page.getByRole('button', { name: 'جرّبي المثال الجاهز' }).click();
  await page.waitForURL(/#\/editor\/.+/);
  await page.locator('.editor-canvas canvas').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  m = await model();
  ok(m.masses.length === 2 && m.measured, 'example loads with 2 masses on a measured plan');
  await page.screenshot({ path: path.join(OUT, '04-example-plan.png') });
  const e0s = await scr(m.masses[0].x, 0, m.masses[0].z), e1s = await scr(m.masses[1].x, 0, m.masses[1].z);
  await page.mouse.click(e0s.x, e0s.y); await page.keyboard.down('Shift'); await page.mouse.click(e1s.x, e1s.y); await page.keyboard.up('Shift');
  await page.getByRole('button', { name: /دمج الكتل/ }).click();
  ok((await model()).masses.length === 1, 'touching masses merged into one');
  await page.keyboard.press('Control+z');
  ok((await model()).masses.length === 2, 'merge undone');
  await page.keyboard.press('2');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '05-example-3d.png') });

  const relevant = errors.filter((e) => !/WebGL|GPU stall|swiftshader|Failed to load resource/i.test(e));
  ok(relevant.length === 0, `no unexpected errors ${relevant.length ? JSON.stringify(relevant.slice(0, 4)) : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
