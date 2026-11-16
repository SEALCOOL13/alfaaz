// "Download all" with Google Fonts mocked, then a real page using a downloaded Google font.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const http = require('http');
const EXT = process.argv[2] || require('path').join(__dirname, '..', 'dist', 'chromium');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FONT = fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');

const cssFor = fam => `/* arabic */
@font-face { font-family: '${fam}'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/x/${encodeURIComponent(fam)}-ar.ttf) format('truetype'); unicode-range: U+0600-06FF, U+200C-200E; }
/* latin */
@font-face { font-family: '${fam}'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/x/${encodeURIComponent(fam)}-lat.ttf) format('truetype'); unicode-range: U+0000-00FF; }`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'self'" }); r.end('<!doctype html><p id="t">اردو زبان کی شاعری بہت مشہور ہے</p>'); });
  await new Promise(r => server.listen(8766, r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
  const swT = await browser.waitForTarget(t => t.type() === 'service_worker', { timeout: 15000 });
  const id = new URL(swT.url()).host;
  await sleep(800);
  const opt = (await browser.pages()).find(p => p.url().includes('options.html')) || await browser.newPage();
  const errors = [];
  opt.on('pageerror', e => errors.push(e.message));
  await opt.setRequestInterception(true);
  let latinFetched = 0;
  opt.on('request', req => {
    const u = req.url();
    if (u.startsWith('https://fonts.googleapis.com/')) {
      const fam = decodeURIComponent(new URL(u).searchParams.get('family').split(':')[0].replace(/\+/g, ' '));
      return req.respond({ status: 200, contentType: 'text/css', body: cssFor(fam), headers: { 'access-control-allow-origin': '*' } });
    }
    if (u.startsWith('https://fonts.gstatic.com/')) {
      if (u.includes('-lat')) latinFetched++;
      return req.respond({ status: 200, contentType: 'font/ttf', body: FONT, headers: { 'access-control-allow-origin': '*' } });
    }
    req.continue();
  });
  await opt.setViewport({ width: 1200, height: 900 });
  await opt.goto(`chrome-extension://${id}/ui/options.html#fonts`, { waitUntil: 'load' });
  await sleep(800);
  const t0 = Date.now();
  await opt.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Download all')).click());
  await opt.waitForFunction(() => document.querySelector('.feedback').textContent.length > 0, { timeout: 60000 });
  console.log('download all:', await opt.$eval('.feedback', e => e.textContent), `${Date.now() - t0}ms`, 'latin files fetched:', latinFetched);
  const lib = await opt.evaluate(async () => Object.keys((await chrome.storage.local.get('library')).library).length);
  console.log('library entries', lib);
  await sleep(500);
  await opt.screenshot({ path: __dirname + '/options-downloaded.png', fullPage: false });

  // A page using the default profile (g:Noto Nastaliq Urdu) — now served from the store.
  const page = await browser.newPage();
  await page.goto('http://localhost:8766/', { waitUntil: 'load' });
  await sleep(1500);
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#t' });
  console.log('rendered with', (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName + '×' + f.glyphCount));
  console.log('attrs', await page.$eval('#t', e => [e.getAttribute('data-alfaaz'), getComputedStyle(e).lineHeight, getComputedStyle(e).fontFamily]));

  // Remove all downloads: arm then confirm.
  const rm = async () => opt.evaluate(() => [...document.querySelectorAll('button')].find(b => /Remove all downloads|Press again/.test(b.textContent)).click());
  await rm(); await rm(); await sleep(800);
  console.log('after remove all:', await opt.evaluate(async () => Object.keys((await chrome.storage.local.get('library')).library).length));
  console.log('errors', errors);
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
