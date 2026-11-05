// End-to-end smoke test of the production build in Chromium.
// Usage: npm run build && (npx vite preview --port 4173 &) && node scripts/e2e.cjs
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = process.env.BASE || 'http://localhost:4173/';
const OUT = process.env.OUT || path.join(__dirname, '..', 'test-results');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const vis = (l) => l.first().waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false);
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };

// --- fixtures -------------------------------------------------------------
function png(w, h, rgb) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const line = x % 40 === 0 || y % 40 === 0; raw[o] = line ? 40 : rgb[0]; raw[o + 1] = line ? 40 : rgb[1]; raw[o + 2] = line ? 40 : rgb[2]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const fx = path.join(OUT, 'fixtures'); fs.mkdirSync(fx, { recursive: true });
fs.writeFileSync(path.join(fx, 'plan-v1.png'), png(800, 600, [250, 245, 235]));
fs.writeFileSync(path.join(fx, 'plan-v2.png'), png(800, 600, [230, 240, 250]));
fs.writeFileSync(path.join(fx, 'brief.pdf'), pdf);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'ar' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  console.log('Welcome & navigation');
  await page.goto(BASE);
  await page.getByText('مرحباً جودي').waitFor();
  ok(await page.locator('html[dir=rtl][lang=ar]').count() === 1, 'document is RTL Arabic');
  await page.screenshot({ path: path.join(OUT, 'desktop-welcome.png') });
  await page.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();
  await page.getByRole('heading', { name: /جودي/ }).first().waitFor();
  for (const [link, heading] of [['المشاريع', 'مشاريعك'], ['الأدوات الهندسية', 'الأدوات الهندسية'], ['المواد الدراسية', 'المواد الدراسية'], ['دفتر الأخطاء', 'دفتر الأخطاء'], ['المساعد الذكي', 'المساعد المعماري'], ['الإعدادات والنسخ الاحتياطي', 'الإعدادات والنسخ الاحتياطي']]) {
    await page.locator('.sidebar').getByRole('link', { name: link }).click();
    ok(await vis(page.getByRole('heading', { level: 1, name: heading })), `nav → ${link}`);
  }

  console.log('Project creation & autosave');
  await page.locator('.sidebar').getByRole('link', { name: 'المشاريع' }).click();
  await page.getByRole('button', { name: 'مشروع جديد' }).first().click();
  await page.getByLabel('اسم المشروع').fill('مكتبة الكورنيش');
  await page.getByRole('button', { name: 'إنشاء المشروع' }).click();
  await page.getByLabel('نص البرنامج (Project brief)').waitFor();
  await page.getByLabel('نص البرنامج (Project brief)').fill('مكتبة عامة من طابقين على كورنيش طرطوس');
  await page.getByLabel('عرض الموقع').fill('40');
  await page.getByLabel('عمق الموقع').fill('30');
  ok(await vis(page.getByText('1,200').first()), 'site area computed 40×30 = 1,200 m²');
  await page.waitForTimeout(1200);
  const projectUrl = page.url();
  await page.reload();
  await page.getByLabel('نص البرنامج (Project brief)').waitFor();
  ok((await page.getByLabel('نص البرنامج (Project brief)').inputValue()).includes('كورنيش طرطوس'), 'brief persisted after reload');
  ok((await page.getByLabel('اسم المشروع').inputValue()) === 'مكتبة الكورنيش', 'name persisted');

  console.log('Site analysis');
  await page.getByRole('button', { name: /تحليل الموقع/ }).click();
  ok(await vis(page.locator('svg[aria-label="مخطط مسار الشمس"]')), 'sun path diagram renders');
  await page.getByPlaceholder('مثال: إطلالة على البحر من الغرب').fill('إطلالة بحرية غرباً');
  await page.getByRole('button', { name: 'إضافة' }).first().click();
  ok(await vis(page.getByText('إطلالة بحرية غرباً')), 'opportunity chip added');
  await page.screenshot({ path: path.join(OUT, 'desktop-site.png'), fullPage: false });

  console.log('Space planning');
  await page.getByRole('button', { name: /البرنامج والمساحات/ }).click();
  for (const [name, area] of [['قاعة مطالعة', '200'], ['استقبال', '60'], ['مخازن', '40']]) {
    await page.getByRole('button', { name: 'فراغ' }).click();
    await page.getByLabel('اسم الفراغ').last().fill(name);
    await page.getByLabel('مساحة الوحدة').last().fill(area);
  }
  ok(await vis(page.locator('tfoot').getByText('300').first()), 'net area = 300 m²');
  // gross = 300 * 1.25 * 1.10 = 412.5
  ok(await vis(page.getByText('413').first()) || await vis(page.getByText('412').first()), 'gross ≈ 412.5 m²');
  await page.locator('.adj-matrix td.adj-0').first().click();
  ok(await page.locator('.adj-matrix td.adj-2').count() >= 1, 'adjacency toggles to essential');
  ok(await page.locator('svg[aria-label="مخطط العلاقات الوظيفية"] circle').count() === 3, 'bubble diagram has 3 bubbles');

  console.log('Concept');
  await page.getByRole('button', { name: /تطوير الفكرة/ }).click();
  await page.getByRole('button', { name: 'إضافة بديل' }).click();
  await page.getByRole('button', { name: 'إضافة بديل' }).click();
  ok(await vis(page.getByText('مصفوفة المقارنة الموزونة')), 'comparison matrix shown');

  console.log('Drawings: image + PDF upload, versions, viewer');
  await page.getByRole('button', { name: /المخططات/ }).first().click();
  await page.locator('input[type=file][multiple]').setInputFiles([path.join(fx, 'plan-v1.png'), path.join(fx, 'brief.pdf')]);
  await page.locator('.thumb').nth(1).waitFor({ timeout: 10000 });
  ok(await page.locator('.thumb').count() === 2, 'two files uploaded (PNG + PDF)');
  await page.locator('.thumb', { hasText: 'plan-v1' }).click();
  await page.locator('.viewer').waitFor();
  await page.locator('.viewer-bar input[type=file]').count().catch(() => 0);
  await page.getByRole('button', { name: /نسخة جديدة/ }).click().catch(() => {});
  await page.locator('input[type=file]:not([multiple])').setInputFiles(path.join(fx, 'plan-v2.png'));
  await page.waitForTimeout(800);
  ok(await page.locator('.viewer select[aria-label="النسخة"]').count() === 1, 'version selector appears after adding v2');
  await page.getByRole('tab', { name: 'جنباً إلى جنب' }).click();
  ok(await page.locator('.viewer-split img').nth(1).waitFor({ timeout: 5000 }).then(() => true, () => false) && await page.locator('.viewer-split img').count() === 2, 'side-by-side comparison shows both versions');
  await page.getByRole('tab', { name: 'سحب للمقارنة' }).click();
  ok(await vis(page.locator('.swipe-handle')), 'swipe comparison handle visible');
  await page.getByRole('button', { name: 'تكبير' }).click();
  await page.screenshot({ path: path.join(OUT, 'desktop-viewer-compare.png') });
  await page.getByRole('button', { name: 'إغلاق' }).first().click();
  await page.reload();
  await page.locator('.thumb').first().waitFor();
  ok(await vis(page.getByText('2 نسخ')), 'files & versions persisted after reload');

  console.log('Report');
  await page.goto(BASE + '#/print/' + projectUrl.split('/projects/')[1].split('/')[0]);
  await page.getByRole('heading', { name: 'مكتبة الكورنيش' }).waitFor();
  ok(await vis(page.locator('.pr-figure img')), 'report includes drawings');
  await page.pdf({ path: path.join(OUT, 'report.pdf'), format: 'A4' });
  ok(fs.statSync(path.join(OUT, 'report.pdf')).size > 10000, 'report prints to PDF');

  console.log('Tools');
  await page.goto(BASE + '#/tools/stairs');
  await page.getByLabel('الارتفاع من بلاط لبلاط').fill('300');
  ok(await vis(page.locator('.result.hero').first().getByText('18', { exact: true })), 'stairs: 300 cm → 18 risers');
  await page.goto(BASE + '#/tools/concrete');
  ok(await vis(page.getByText('185.6').first()) || await vis(page.getByText('167.0').first()), 'concrete capacity computed');
  await page.goto(BASE + '#/tools/units');
  ok(await vis(page.getByText('10.197').first()), 'units: 1 MPa = 10.197 kg/cm²');
  for (const t of ['scale', 'area', 'quantities', 'materials', 'space', 'checklist', 'measure']) {
    await page.goto(BASE + '#/tools/' + t);
    ok(await vis(page.locator('h1')), `tool ${t} renders`);
  }

  console.log('Academy & mistakes');
  await page.goto(BASE + '#/academy/rc-1');
  await page.getByRole('button', { name: /استخدام الخطة المقترحة/ }).click();
  await page.getByLabel('منجز').first().check();
  await page.getByRole('button', { name: 'تسجيل خطأ' }).click();
  await page.locator('form textarea').first().fill('احسبي a لمقطع 300×500 مع 3Ø20');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await page.goto(BASE + '#/mistakes');
  ok(await vis(page.getByText('احسبي a لمقطع')), 'mistake appears in notebook');
  await page.getByRole('button', { name: /اكشفي الإجابة/ }).click();
  await page.getByRole('button', { name: /فهمتُه/ }).click();
  await page.getByRole('tab', { name: /أتقنتُها/ }).click();
  ok(await vis(page.getByText('احسبي a لمقطع')), 'mistake moved to mastered');

  console.log('AI assistant (mock backend)');
  await page.route('https://ai.test/**', async (route) => {
    const u = route.request().url();
    const auth = route.request().headers()['authorization'];
    if (auth !== 'Bearer good') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
    if (u.endsWith('/v1/status')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, provider: 'mock', model: 'm', month: '2026-11', spentEur: 0.12, limitEur: 4.5, remainingEur: 4.38, requestsToday: 1, maxRequestsPerDay: 60, maxImageBytes: 1500000 }) });
    const body = JSON.parse(route.request().postData());
    const hasCtx = body.context.includes('مكتبة الكورنيش');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: hasCtx ? 'ما أراه: المدخل واضح.' : 'no-context', costEur: 0.002, spentEur: 0.122, limitEur: 4.5 }) });
  });
  await page.goto(BASE + '#/settings');
  await page.getByLabel('عنوان الخادم').fill('https://ai.test');
  await page.getByLabel('رمز الوصول الشخصي').fill('bad');
  await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
  ok(await vis(page.getByText('رمز الوصول غير صحيح')), 'wrong token → clear Arabic error');
  await page.getByLabel('رمز الوصول الشخصي').fill('good');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
  ok(await vis(page.getByText(/متصل: mock/)), 'status endpoint OK');
  await page.goto(BASE + '#/assistant');
  await page.getByRole('button', { name: 'محادثة جديدة' }).first().click();
  await page.getByLabel('المشروع المرتبط').selectOption({ label: 'مكتبة الكورنيش' });
  await page.getByLabel('الرسالة').fill('هل يوجد مشاكل بالحركة والمداخل؟');
  await page.getByRole('button', { name: 'إرسال' }).click();
  await page.getByText('ما أراه: المدخل واضح.').waitFor({ timeout: 5000 }).catch(() => {});
  ok(await vis(page.getByText('ما أراه: المدخل واضح.')), 'assistant reply rendered with project context sent');
  await page.unroute('https://ai.test/**');
  await page.route('https://ai.test/**', (r) => r.abort('internetdisconnected'));
  await page.getByLabel('الرسالة').fill('سؤال آخر');
  await page.getByRole('button', { name: 'إرسال' }).click();
  await page.waitForTimeout(800);
  ok(await vis(page.getByText(/تعذّر الوصول إلى خادم المساعد/)), 'network failure handled gracefully');

  console.log('Backup export → import on a fresh device');
  await page.goto(BASE + '#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /تصدير نسخة احتياطية/ }).click()]);
  const backupPath = path.join(OUT, 'backup.zip');
  await dl.saveAs(backupPath);
  ok(fs.statSync(backupPath).size > 1000, 'backup zip downloaded');
  const zipText = fs.readFileSync(backupPath).toString('latin1');
  ok(!zipText.includes('good') || !/aiToken"?:"good/.test(zipText), 'backup does not contain AI token');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();
  await p2.goto(BASE + '#/settings');
  await p2.locator('input[type=file][accept*=zip]').setInputFiles(backupPath);
  await p2.getByRole('button', { name: 'دمج مع بياناتي' }).click();
  await p2.waitForTimeout(2500);
  await p2.goto(BASE + '#/projects');
  ok(await vis(p2.getByText('مكتبة الكورنيش').first()), 'project restored on second device');
  await p2.getByText('مكتبة الكورنيش').first().click();
  await p2.goto(p2.url().replace(/\/projects\/([^/]+).*$/, '/projects/$1/drawings'));
  await p2.locator('.thumb').first().waitFor();
  ok(await p2.locator('.thumb').count() === 2, 'files restored on second device');
  await ctx2.close();

  console.log('Offline (service worker)');
  await page.goto(BASE);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('.sidebar').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await vis(page.locator('.sidebar')), 'app shell loads offline');
  ok(await vis(page.getByText('بدون إنترنت').first()), 'offline badge shown');
  await page.goto(BASE + '#/projects');
  ok(await vis(page.getByText('مكتبة الكورنيش').first()), 'projects available offline');
  const fontsOk = await page.evaluate(() => document.fonts.check('16px "IBM Plex Sans Arabic"', 'جودي'));
  ok(fontsOk, 'Arabic font available offline (self-hosted)');
  await ctx.setOffline(false);

  console.log('Responsive');
  await page.goto(BASE);
  await page.screenshot({ path: path.join(OUT, 'desktop-dashboard.png'), fullPage: true });
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const ph = await phone.newPage();
  ph.on('pageerror', (e) => errors.push('[phone] ' + e.message));
  await ph.goto(BASE);
  await ph.screenshot({ path: path.join(OUT, 'phone-welcome.png') });
  await ph.getByRole('button', { name: /ادخلي إلى الاستوديو/ }).click();
  ok(await vis(ph.locator('.mobile-nav')), 'phone: bottom navigation visible');
  ok(!(await ph.locator('.sidebar').isVisible()), 'phone: desktop sidebar hidden');
  for (const route of ['', 'projects', 'tools/stairs', 'academy', 'assistant', 'settings', 'mistakes']) {
    await ph.goto(BASE + '#/' + route);
    await ph.waitForTimeout(300);
    const overflow = await ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `phone: no horizontal scroll on /${route} (${overflow}px)`);
  }
  await ph.goto(BASE + '#/');
  await ph.screenshot({ path: path.join(OUT, 'phone-dashboard.png'), fullPage: true });
  await ph.goto(BASE + '#/tools/concrete');
  await ph.screenshot({ path: path.join(OUT, 'phone-concrete.png'), fullPage: true });
  await phone.close();

  console.log('PWA manifest');
  const manifest = await (await page.request.get(BASE + 'manifest.webmanifest')).json();
  ok(manifest.short_name === 'Joudy Studio' && /Joudy/.test(manifest.name) && !/Judy/.test(JSON.stringify(manifest)), 'manifest names spelled Joudy');
  ok(manifest.icons.some((i) => i.sizes === '512x512') && manifest.display === 'standalone', 'installable manifest (512 icon, standalone)');

  const relevant = errors.filter((e) => !/ai\.test|Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(e));
  ok(relevant.length === 0, `no unexpected console/page errors ${relevant.length ? JSON.stringify(relevant.slice(0, 5)) : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
