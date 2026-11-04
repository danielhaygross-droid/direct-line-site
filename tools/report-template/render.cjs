const { chromium } = require('playwright-core');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Users/erwin/AppData/Local/ms-playwright/chromium-1194/chrome-win/chrome.exe' });
  const p = await b.newPage();
  await p.goto(pathToFileURL(path.resolve(__dirname, 'report.html')).href);
  await p.waitForLoadState('networkidle');
  await p.pdf({ path: process.argv[2], format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:7pt;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial"><span>Direct Line — work report, 20 October 2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  await b.close();
})();
