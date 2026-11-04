const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url'); const path = require('path');
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Users/erwin/AppData/Local/ms-playwright/chromium-1194/chrome-win/chrome.exe' });
  for (const L of ['en', 'he']) { const p = await b.newPage({ viewport: { width: 794, height: 1123 } }); await p.goto(pathToFileURL(path.resolve(__dirname, `report-${L}.html`)).href); await p.waitForTimeout(800);
    await p.screenshot({ path: path.resolve(__dirname, `rep-${L}.png`), fullPage: true }); }
  await b.close(); console.log('ok'); })();
