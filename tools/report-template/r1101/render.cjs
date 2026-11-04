const { chromium } = require('playwright-core');
const path = require('path'); const { pathToFileURL } = require('url');
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Users/erwin/AppData/Local/ms-playwright/chromium-1194/chrome-win/chrome.exe' });
  for (const [L, out, foot] of [['en', 'Direct-Line-work-report-1-Nov-2026-EN.pdf', 'Direct Line — work report, 1 November 2026'], ['he', 'Direct-Line-work-report-1-Nov-2026-HE.pdf', 'Direct Line — דוח עבודה, 1 בנובמבר 2026']]) {
    const p = await b.newPage(); await p.goto(pathToFileURL(path.resolve(__dirname, `report-${L}.html`)).href); await p.waitForLoadState('networkidle');
    await p.pdf({ path: path.resolve(__dirname, '../../../reports', out), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:7pt;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial"><span>${foot}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` }); await p.close(); }
  await b.close(); console.log('ok'); })();
