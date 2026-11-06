// Renders index.html to an A4 PDF with headless Chromium.
//   node pdf/ai-automation/build.cjs            -> PDF only
//   node pdf/ai-automation/build.cjs --png DIR  -> PDF + one PNG per page (for checking layout)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const here = __dirname;
const out = path.join(here, '박원찬_포트폴리오_AI개발자동화.pdf');
const pngIdx = process.argv.indexOf('--png');
const pngDir = pngIdx > -1 ? process.argv[pngIdx + 1] : null;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(here, 'index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Every .page is exactly one A4 sheet; flag any whose content runs past the bottom edge.
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('.page')].map((p, i) => {
      const limit = p.getBoundingClientRect().bottom;
      let worst = 0;
      p.querySelectorAll('*').forEach(el => {
        if (el.closest('.ring,.disc')) return;
        const r = el.getBoundingClientRect();
        if (r.height && r.bottom - limit > worst) worst = r.bottom - limit;
      });
      return { page: i + 1, overflowPx: Math.round(worst) };
    }).filter(x => x.overflowPx > 0));
  if (overflow.length) console.warn('overflow:', JSON.stringify(overflow));

  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('wrote', out);

  if (pngDir) {
    fs.mkdirSync(pngDir, { recursive: true });
    await page.emulateMedia({ media: 'print' });
    const pages = await page.$$('.page');
    for (let i = 0; i < pages.length; i++) {
      await pages[i].screenshot({ path: path.join(pngDir, `p${i + 1}.png`) });
    }
    console.log('pngs in', pngDir);
  }
  await browser.close();
})();
