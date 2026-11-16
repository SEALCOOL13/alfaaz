const puppeteer = require('puppeteer-core'); const http = require('http');
const EXT=require('path').join(__dirname, '..', 'dist', 'chromium'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end('<!doctype html><p id="t">اردو زبان کی شاعری بہت مشہور ہے</p><iframe srcdoc="<p id=f>اردو فریم کے اندر ہے</p>"></iframe>');});
  await new Promise(r=>server.listen(8767,r));
  const b=await puppeteer.launch({executablePath:process.env.CHROME || '/usr/bin/google-chrome',headless:'new',args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-sandbox']});
  const swT=await b.waitForTarget(t=>t.type()==='service_worker'); const sw=await swT.worker(); await sleep(800);
  await sw.evaluate(async()=>{const s=Alfaaz.sanitize({});s.profiles.u.font='l:FreeSerif';await chrome.storage.local.set({settings:s});});
  const p=await b.newPage(); await p.goto('http://localhost:8767/'); await sleep(1200);
  const ff=async()=>[await p.$eval('#t',e=>getComputedStyle(e).fontFamily), await p.frames()[1].$eval('#f',e=>getComputedStyle(e).fontFamily)];
  console.log('on', await ff());
  const tabId=await sw.evaluate(async()=>(await chrome.tabs.query({url:'http://localhost/*'}))[0].id);
  console.log('pause reply', await sw.evaluate(async id=>chrome.tabs.sendMessage(id,{t:'pause'}),tabId)); await sleep(400);
  console.log('paused', await ff(), await sw.evaluate(async id=>chrome.action.getBadgeText({tabId:id}),tabId));
  await sw.evaluate(async id=>chrome.tabs.sendMessage(id,{t:'pause'}),tabId); await sleep(400);
  await sw.evaluate(async()=>{const s=Alfaaz.sanitize((await chrome.storage.local.get('settings')).settings);s.disabledHosts=['localhost'];await chrome.storage.local.set({settings:s});}); await sleep(500);
  console.log('site off', await ff(), await sw.evaluate(async id=>chrome.action.getBadgeText({tabId:id}),tabId));
  await b.close(); server.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
