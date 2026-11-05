// Renders the SVG brand mark to PNG icons with the preinstalled Chromium.
// Usage: node scripts/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const dir = path.join(__dirname, '..', 'public', 'icons');
  const icon = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  const mask = fs.readFileSync(path.join(dir, 'maskable.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  const jobs = [
    ['icon-192.png', icon, 192, 'transparent'],
    ['icon-512.png', icon, 512, 'transparent'],
    ['icon-maskable-512.png', mask, 512, '#211F1C'],
    ['apple-touch-icon.png', mask, 180, '#211F1C'],
  ];
  for (const [name, svg, size, bg] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:${bg}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(dir, name), omitBackground: bg === 'transparent' });
  }
  await b.close();
  console.log('icons written');
})();
