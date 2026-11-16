// Opens the popup and settings pages of the unpacked extension, exercises them and takes screenshots.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const EXT = process.argv[2] || require('path').join(__dirname, '..', 'dist', 'chromium');
const OUT = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--lang=en-US'],
  });
  const swT = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 15000 });
  const sw = await swT.worker();
  const id = new URL(swT.url()).host;
  await sleep(800);

  const b64 = fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSerif.ttf').toString('base64');
  await sw.evaluate(async b64 => {
    await FontStore.importFile('FreeSerif Naskh.ttf', Alfaaz.fromB64(b64));
    const s = Alfaaz.sanitize((await chrome.storage.local.get('settings')).settings);
    s.customFonts.push({ id: 'l:DejaVu Sans', name: 'DejaVu Sans', names: [] });
    const lib = (await chrome.storage.local.get('library')).library;
    s.profiles.u.font = Object.keys(lib)[0];
    s.profiles.a.font = 'l:DejaVu Sans';
    await chrome.storage.local.set({ settings: s });
  }, b64);

  const errors = [];
  for (const scheme of ['light', 'dark']) {
    const pages = await browser.pages();
    const opt = pages.find(p => p.url().includes('options.html')) || await browser.newPage();
    opt.on('pageerror', e => errors.push('options: ' + e.message));
    opt.on('console', m => { if (m.type() === 'error') errors.push('options console: ' + m.text()); });
    await opt.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await opt.setViewport({ width: 1200, height: 900 });
    await opt.goto(`chrome-extension://${id}/ui/options.html`, { waitUntil: 'load' });
    await sleep(1200);
    await opt.screenshot({ path: `${OUT}/options-${scheme}.png`, fullPage: true });

    const pop = await browser.newPage();
    pop.on('pageerror', e => errors.push('popup: ' + e.message));
    pop.on('console', m => { if (m.type() === 'error') errors.push('popup console: ' + m.text()); });
    await pop.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await pop.setViewport({ width: 360, height: 760 });
    await pop.goto(`chrome-extension://${id}/ui/popup.html`, { waitUntil: 'load' });
    await sleep(1000);
    await pop.screenshot({ path: `${OUT}/popup-${scheme}.png`, fullPage: true });

    if (scheme === 'light') {
      // Drag the line height slider and check storage follows.
      await pop.evaluate(() => {
        const r = [...document.querySelectorAll('input[type=range]')][3];
        r.value = '2.6'; r.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(300);
      const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings.profiles.u.lineHeight);
      console.log('line height after slider', s);
      // Switch to Arabic tab
      await pop.evaluate(() => [...document.querySelectorAll('.seg button')][1].click());
      await sleep(600);
      await pop.screenshot({ path: `${OUT}/popup-arabic.png`, fullPage: true });
      const status = await pop.$eval('.status', el => el.textContent);
      console.log('arabic status:', status);
    }
    await pop.close();
  }
  console.log('errors', errors);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
