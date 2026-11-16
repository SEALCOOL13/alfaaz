// Loads the unpacked extension into real Chrome and checks the page engine on a hostile test page.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const EXT = process.argv[2] || require('path').join(__dirname, '..', 'dist', 'chromium');

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/s.css"></head><body>
<p id="ur" style="font-family: Georgia, serif !important; line-height: 1.1 !important; letter-spacing: 0 !important">پاکستان کی قومی زبان اردو ہے اور یہ بہت خوبصورت ہے۔</p>
<p id="ar">اللغة العربية لغة جميلة وغنية بالمفردات والتراكيب.</p>
<p id="mix">This is an English sentence with one word <span id="mixw">اردو</span> inside it, and it keeps going in English.</p>
<p id="en">Plain English only.</p>
<div id="comment" class="c">یہ ایک تبصرہ ہے جو بائیں طرف نظر آتا ہے</div>
<h2 id="center" style="text-align:center">مرکزی عنوان یہاں ہے</h2>
<input id="inp" value="سلام دنیا">
<open-el id="open"></open-el>
<closed-el id="closed"></closed-el>
<script src="/app.js"></script>
</body></html>`;

const APP = `
customElements.define('open-el', class extends HTMLElement { constructor(){ super(); this.attachShadow({mode:'open'}).innerHTML = '<span id="o">کھلا شیڈو متن</span>'; } });
setTimeout(() => {
  customElements.define('closed-el', class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:'closed'}); window.__closed = r; r.innerHTML = '<span id="c">بند شیڈو متن یہاں</span>'; } });
  const p = document.createElement('p'); p.id = 'dyn'; p.textContent = 'بعد میں شامل کیا گیا متن'; document.body.appendChild(p);
  document.adoptedStyleSheets = [];   // a hostile page wiping sheets
}, 300);
`;
const CSS = `body{font-family: Verdana, sans-serif} .c{text-align:left; letter-spacing:.2em !important}`;

const server = http.createServer((req, res) => {
  const csp = { 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'" };
  if (req.url === '/s.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(CSS); }
  if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(APP); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...csp }); res.end(PAGE);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--lang=en-US'],
  });
  const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 15000 });
  const sw = await swTarget.worker();
  const extId = new URL(swTarget.url()).host;
  console.log('extension id', extId);
  await sleep(500);
  for (const p of await browser.pages()) if (p.url().includes(extId)) await p.close();

  // Font file into the store (stands in for a downloaded Google font).
  const b64 = fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSerif.ttf').toString('base64');
  const fileId = await sw.evaluate(async b64 => {
    const rec = await FontStore.importFile('DejaVu Serif Test.ttf', Alfaaz.fromB64(b64));
    return rec.id;
  }, b64);
  console.log('stored font', fileId);

  await sw.evaluate(async fileId => {
    const s = Alfaaz.sanitize({});
    s.profiles.u = { font: fileId, sizePct: 130, letterEm: 0.02, wordEm: 0.1, lineHeight: 2.4 };
    s.profiles.a = { font: 'l:DejaVu Sans', sizePct: 100, letterEm: 0, wordEm: 0, lineHeight: 1.9 };
    await chrome.storage.local.set({ settings: s });
  }, fileId);

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8765/', { waitUntil: 'load' });
  await sleep(1500);

  const info = await page.evaluate(() => {
    const q = (id, root = document) => root.getElementById ? root.getElementById(id) : root.querySelector('#' + id);
    const pick = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        khat: el.getAttribute('data-alfaaz'), s: el.getAttribute('data-alfaaz-s'), lh: el.getAttribute('data-alfaaz-lh'), ltr: el.getAttribute('data-alfaaz-ltr'),
        ff: cs.fontFamily, lineHeight: cs.lineHeight, letter: cs.letterSpacing, word: cs.wordSpacing, align: cs.textAlign, bidi: cs.unicodeBidi,
      };
    };
    return {
      ur: pick(q('ur')), ar: pick(q('ar')), mix: pick(q('mix')), mixw: pick(q('mixw')), en: pick(q('en')),
      comment: pick(q('comment')), center: pick(q('center')), inp: pick(q('inp')), dyn: pick(q('dyn')),
      open: pick(document.getElementById('open').shadowRoot.getElementById('o')),
      closed: pick(window.__closed && window.__closed.getElementById('c')),
      fonts: [...document.fonts].map(f => `${f.family} ${f.status} ${f.unicodeRange.slice(0, 12)}`),
    };
  });
  console.log(JSON.stringify(info, null, 1));

  // Which font actually draws the glyphs?
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  for (const id of ['ur', 'ar', 'mix', 'en', 'comment']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#' + id });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    console.log('rendered', id, fonts.map(f => `${f.familyName}×${f.glyphCount}`).join(', '));
  }

  // Compare toggle and site off
  await page.screenshot({ path: __dirname + '/engine-on.png' });
  console.log('errors', errors);
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
