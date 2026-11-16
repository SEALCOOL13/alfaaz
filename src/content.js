/* Alfaaz — page engine. Runs in every frame of every page.
 *
 * How it stays reliable
 *  - Page text is never moved, wrapped or rewritten. Elements that hold Arabic-script text get a data attribute,
 *    so React, Vue, editors and the like keep working.
 *  - Styles reach the page twice: a user-level stylesheet injected by the browser (pages can't block, remove or
 *    override it, not even with !important), and a constructed stylesheet as an instant fallback and for shadow roots.
 *  - Fonts are handed to the page with the FontFace API from bytes the extension keeps, so a page's CSP can't block them.
 *    Every face is limited to Arabic-script code points, so Latin, Devanagari, CJK and emoji keep the page's own fonts.
 *
 * What gets which style
 *  - Font: any element with Arabic-script text of its own (only its Arabic letters change).
 *  - Letter and word spacing: elements whose own text is mostly Arabic script (the threshold in settings).
 *  - Line height and right-alignment: the nearest block (paragraph, cell, list item…) whose text is mostly Arabic script.
 *  - Urdu and Arabic/Persian are told apart by letters only Urdu uses, so each can have its own profile. */
(() => {
  'use strict';
  if (globalThis.__alfaazLoaded) return;
  globalThis.__alfaazLoaded = true;

  const K = Alfaaz, api = K.api;
  const A = 'data-alfaaz', AS = 'data-alfaaz-s', AL = 'data-alfaaz-lh', AD = 'data-alfaaz-ltr';
  const OUR = new Set(Object.values(K.FAMILIES));
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed']);
  const FIELDS = new Set(['input', 'textarea']);
  const MO_OPTS = { childList: true, subtree: true, characterData: true };
  const LAYERED = typeof CSSLayerBlockRule !== 'undefined';
  const IS_TOP = (() => { try { return window.top === window; } catch (e) { return false; } })();

  let S = null, lib = {}, host = '', paused = false, active = false, started = false, booted = false;
  const stats = { u: 0, a: 0 };
  const stackIds = new Map();
  let stackDirty = false;
  const queue = new Set(), pending = new Set();
  const rootRefs = [], rootSet = new WeakSet();
  const displayCache = new WeakMap();
  let mo = null, scheduled = false;

  const profFor = L => (S.separateArabic ? S.profiles[L] : S.profiles.u);
  const famFor = L => (S.separateArabic ? K.FAMILIES[L] : K.FAMILIES.u);
  const needFont = () => active && K.LANGS.some(L => profFor(L).font);

  /* ───────────────────────── text analysis ───────────────────────── */

  const count = (text, re) => { const m = text.match(re); return m ? m.length : 0; };

  function analyse(text) {
    if (!text || !K.AR_TEST.test(text)) return null;
    const ar = count(text, K.AR_LETTERS);
    if (!ar) return null;
    return { ar, other: count(text, K.OTHER_LETTERS), urdu: K.URDU_MARKS.test(text) };
  }

  const ratioOf = a => (a.ar * 100) / Math.max(1, a.ar + a.other);

  function langAttr(el) {
    try {
      const x = el.closest('[lang]');
      return ((x ? x.getAttribute('lang') : document.documentElement.getAttribute('lang')) || '').toLowerCase();
    } catch (e) { return ''; }
  }

  // Urdu letters decide it. Longer text without them is Arabic or Persian. Short text follows the lang attribute,
  // then whichever language the page has shown more of.
  function langOf(el, a) {
    if (a.urdu) { if (a.ar >= 12) stats.u++; return 'u'; }
    if (a.ar >= 12) { stats.a++; return 'a'; }
    const l = langAttr(el);
    if (/^ur/.test(l)) return 'u';
    if (/^(ar|fa|ps|sd|ug|ku|ckb|bal|prs)\b/.test(l)) return 'a';
    return stats.a > stats.u ? 'a' : 'u';
  }

  const isField = el => FIELDS.has(el.localName);
  const isEditable = el => isField(el) || el.isContentEditable;

  function ownText(el) {
    let s = '';
    if (isField(el)) {
      try { s = (el.value || '') + ' ' + (el.placeholder || ''); } catch (e) { /* ignore */ }
    }
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { s += c.nodeValue; if (s.length > 3000) break; }
    }
    return s;
  }

  function sampleText(root, max) {
    let s = '';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (p && SKIP.has(p.localName)) continue;
      s += n.nodeValue;
      if (s.length >= max) break;
    }
    if (isField(root)) { try { s += root.value || ''; } catch (e) { /* ignore */ } }
    return s;
  }

  function isInline(el) {
    let d = displayCache.get(el);
    if (d === undefined) {
      try { d = getComputedStyle(el).display; } catch (e) { d = ''; }
      displayCache.set(el, d);
    }
    return d === 'inline' || d === 'contents' || d === 'ruby' || d === 'ruby-text';
  }

  function blockOf(el) {
    let b = el;
    for (let i = 0; b && i < 16; i++) {
      if (b === document.body || b === document.documentElement) return null;
      if (!isInline(b)) return b;
      b = b.parentElement;
    }
    return null;
  }

  /* ───────────────────────── font stacks ───────────────────────── */

  // Each element keeps its original font stack after ours, so non-Arabic text in it looks exactly as before.
  function stackId(stack) {
    if (!stack || /[{};<\\]|\/\*/.test(stack) || stack.length > 600) return '0';
    let id = stackIds.get(stack);
    if (!id) { id = String(stackIds.size + 1); stackIds.set(stack, id); stackDirty = true; }
    return id;
  }

  function captureFF(el) {
    try {
      return (getComputedStyle(el).fontFamily || '').split(',')
        .filter(p => !OUR.has(p.trim().replace(/^["']|["']$/g, ''))).join(',').trim();
    } catch (e) { return ''; }
  }

  /* ───────────────────────── style sheets ───────────────────────── */

  const Styles = {
    adopt: false, sheet: null, text: '', els: new Map(),
    init() {
      try {
        const sh = new CSSStyleSheet();
        sh.replaceSync('');
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
        this.sheet = sh; this.adopt = true;
      } catch (e) { this.adopt = false; }
    },
    set(text) {
      if (this.text === text) return;
      this.text = text;
      if (this.adopt) { try { this.sheet.replaceSync(text); } catch (e) { /* ignore */ } }
      for (const el of this.els.values()) el.textContent = text;
    },
    attach(root) {
      if (this.adopt) {
        try {
          const cur = Array.from(root.adoptedStyleSheets);
          if (!cur.includes(this.sheet)) root.adoptedStyleSheets = [...cur, this.sheet];
          return;
        } catch (e) { /* fall back to a <style> element */ }
      }
      const parent = root === document ? (document.head || document.documentElement) : root;
      if (!parent) return;
      let el = this.els.get(root);
      if (!el) {
        el = document.createElement('style');
        el.setAttribute('data-alfaaz-style', '');
        el.textContent = this.text;
        this.els.set(root, el);
      }
      if (!el.isConnected) parent.appendChild(el);
    },
    ensure() {
      this.attach(document);
      forEachRoot(r => this.attach(r));
    },
  };

  function buildCSS(layered) {
    if (!active) return '';
    const head = [], rules = [];
    const faces = new Set();
    for (const L of K.LANGS) {
      const p = profFor(L), fam = famFor(L);
      if (p.font) {
        if (K.kindOf(p.font) === 'local' && !faces.has(fam)) {
          faces.add(fam);
          const size = p.sizePct !== 100 ? `size-adjust:${p.sizePct}%;` : '';
          head.push(`@font-face{font-family:"${fam}";src:${K.localSrc(K.localNames(p.font, S))};unicode-range:${K.UNICODE_RANGE};font-display:swap;${size}}`);
        }
        rules.push(`[${A}="${L}"]{font-family:"${fam}",system-ui,sans-serif!important}`);
        for (const [stack, id] of stackIds) rules.push(`[${A}="${L}${id}"]{font-family:"${fam}",${stack}!important}`);
      }
      const sp = [];
      if (p.letterEm) sp.push(`letter-spacing:${p.letterEm}em!important`);
      if (p.wordEm) sp.push(`word-spacing:${p.wordEm}em!important`);
      if (sp.length) rules.push(`[${AS}="${L}"]{${sp.join(';')}}`);
      if (p.lineHeight) {
        rules.push(`[${AL}="${L}"]{line-height:${p.lineHeight}!important}`);
        rules.push(`[${AL}="${L}"] :where([${A}]:not([${AL}])){line-height:inherit!important}`);
      }
      if (S.alignRtl) {
        rules.push(`[${AL}="${L}"][${AD}]{unicode-bidi:plaintext!important}`);
        rules.push(`[${AL}="${L}"][${AD}="a"]{text-align:start!important}`);
      }
    }
    if (!rules.length && !head.length) return '';
    const body = rules.join('\n');
    return head.join('\n') + '\n' + (layered && LAYERED ? `@layer alfaaz{\n${body}\n}` : body);
  }

  // The user-level sheet goes through the background, debounced so slider drags don't flood it.
  let userCSS = '', userWant = '', userTimer = 0, userChain = Promise.resolve();
  function scheduleUser(css) {
    userWant = css;
    clearTimeout(userTimer);
    userTimer = setTimeout(() => {
      userChain = userChain.then(async () => {
        if (userWant === userCSS) return;
        const prev = userCSS, next = userWant;
        try {
          const r = await api.runtime.sendMessage({ t: 'css', css: next, prev });
          if (r && r.ok) userCSS = next;
        } catch (e) { /* background unavailable; the page-level sheet still applies */ }
      });
    }, userCSS ? 200 : 0);
  }

  function applyCSS() {
    Styles.set(active ? buildCSS(true) : '');
    scheduleUser(active ? buildCSS(false) : '');
  }

  /* ───────────────────────── fonts ───────────────────────── */

  const faceSets = new Map();   // family → { key, list }
  const byteCache = new Map();  // font id → { updated, faces: [{ weight, style, buf }] }
  let faceChain = Promise.resolve(), faceTimer = 0;

  async function fontBytes(id) {
    const meta = lib[id];
    const hit = byteCache.get(id);
    if (hit && (!meta || hit.updated === meta.updated)) return hit;
    const r = await api.runtime.sendMessage({ t: 'font', id });
    if (!r || !r.ok) throw new Error((r && r.error) || 'font unavailable');
    const out = { updated: r.updated, faces: r.faces.map(f => ({ weight: f.weight, style: f.style, buf: K.fromB64(f.b64) })) };
    byteCache.set(id, out);
    return out;
  }

  async function makeFaces(fam, p) {
    const desc = { unicodeRange: K.UNICODE_RANGE, display: 'swap' };
    if (p.sizePct !== 100) desc.sizeAdjust = p.sizePct + '%';
    if (K.kindOf(p.font) === 'local') return [new FontFace(fam, K.localSrc(K.localNames(p.font, S)), desc)];
    const data = await fontBytes(p.font);
    return data.faces.map(f => new FontFace(fam, f.buf, Object.assign({}, desc, { weight: f.weight, style: f.style })));
  }

  async function syncFaces() {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const want = new Map();
    if (active) {
      for (const L of K.LANGS) {
        if (L === 'a' && !S.separateArabic) continue;
        const p = S.profiles[L];
        if (p.font) want.set(K.FAMILIES[L], p);
      }
    }
    for (const fam of OUR) {
      const p = want.get(fam);
      const key = p ? `${p.font}|${p.sizePct}|${(lib[p.font] || {}).updated || 0}` : '';
      const cur = faceSets.get(fam);
      if ((cur ? cur.key : '') === key) continue;
      let list = [];
      if (p) {
        try { list = await makeFaces(fam, p); } catch (e) { list = []; }
        for (const f of list) { try { document.fonts.add(f); f.load().catch(() => {}); } catch (e) { /* ignore */ } }
      }
      if (cur) for (const f of cur.list) { try { document.fonts.delete(f); } catch (e) { /* ignore */ } }
      faceSets.set(fam, { key, list });
    }
  }

  function syncFacesSoon() {
    clearTimeout(faceTimer);
    faceTimer = setTimeout(() => { faceChain = faceChain.then(syncFaces, syncFaces); }, faceSets.size ? 120 : 0);
  }

  /* ───────────────────────── scanning ───────────────────────── */

  function forEachRoot(fn) {
    for (let i = rootRefs.length - 1; i >= 0; i--) {
      const r = rootRefs[i].deref();
      if (!r) { rootRefs.splice(i, 1); continue; }
      fn(r);
    }
  }

  function closedRoot(el) {
    try { if (api.dom && typeof api.dom.openOrClosedShadowRoot === 'function') return api.dom.openOrClosedShadowRoot(el) || null; } catch (e) { /* ignore */ }
    try { return el.openOrClosedShadowRoot || null; } catch (e) { return null; }
  }

  const shadowOf = el => el.shadowRoot || (el.localName.includes('-') ? closedRoot(el) : null);

  function watchRoot(root) {
    if (!root || rootSet.has(root)) return;
    rootSet.add(root);
    rootRefs.push(new WeakRef(root));
    Styles.attach(root);
    if (mo && started) mo.observe(root, MO_OPTS);
    scanTree(root);
  }

  function handleText(node) {
    const el = node.parentElement;
    if (!el || SKIP.has(el.localName)) return;
    const v = node.nodeValue;
    if ((v && K.AR_TEST.test(v)) || el.hasAttribute(A)) pending.add(el);
  }

  function checkElement(el) {
    const r = shadowOf(el);
    if (r) watchRoot(r);
    if (isField(el)) {
      try { if (K.AR_TEST.test(el.value || '') || K.AR_TEST.test(el.placeholder || '') || el.hasAttribute(A)) pending.add(el); } catch (e) { /* ignore */ }
    }
  }

  function scanTree(root) {
    const t = root.nodeType;
    if (t === 3) { handleText(root); return; }
    if (t !== 1 && t !== 9 && t !== 11) return;
    if (t === 1) {
      if (SKIP.has(root.localName)) return;
      checkElement(root);
    }
    const w = document.createTreeWalker(root, 5); // elements and text
    let n = w.nextNode();
    while (n) {
      if (n.nodeType === 3) { handleText(n); n = w.nextNode(); continue; }
      if (SKIP.has(n.localName)) { n = skipSubtree(w, root); continue; }
      checkElement(n);
      n = w.nextNode();
    }
  }

  function skipSubtree(w, root) {
    for (;;) {
      const s = w.nextSibling();
      if (s) return s;
      const p = w.parentNode();
      if (!p || p === root) return null;
    }
  }

  function setAttr(el, name, v) {
    if (v == null) { if (el.hasAttribute(name)) el.removeAttribute(name); }
    else if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }

  function flush() {
    if (!pending.size) return;
    const els = [];
    for (const el of pending) if (el.isConnected) els.push(el);
    pending.clear();
    if (!els.length) return;

    // Read everything first, then write, so the browser recalculates styles once.
    const capture = needFont();
    const recs = [], blocks = new Map();
    for (const el of els) {
      if (!S.styleFields && isEditable(el)) { recs.push({ el, val: null }); continue; }
      const a = analyse(ownText(el));
      if (!a) { recs.push({ el, val: null }); continue; }
      const L = langOf(el, a);
      const cur = el.getAttribute(A);
      let id = cur && cur.length > 1 ? cur.slice(1) : '';
      if (!id && capture) id = stackId(captureFF(el));
      recs.push({ el, val: L + id, sp: ratioOf(a) >= S.threshold ? L : null });
      const b = blockOf(el);
      if (b && !blocks.has(b)) blocks.set(b, null);
    }
    for (const b of blocks.keys()) {
      const a = analyse(sampleText(b, 3000));
      if (!a || ratioOf(a) < S.threshold) { blocks.set(b, { lh: null }); continue; }
      let ad = null;
      try {
        const cs = getComputedStyle(b);
        if (cs.direction === 'ltr') ad = cs.textAlign === 'left' ? 'a' : 'b';
      } catch (e) { /* ignore */ }
      blocks.set(b, { lh: langOf(b, a), ad });
    }

    for (const r of recs) { setAttr(r.el, A, r.val); setAttr(r.el, AS, r.val ? r.sp : null); }
    for (const [b, r] of blocks) { setAttr(b, AL, r.lh); setAttr(b, AD, r.lh ? r.ad : null); }
    if (stackDirty) { stackDirty = false; applyCSS(); }
  }

  // The font was off when these were tagged, so their original stack wasn't recorded yet.
  function recaptureAll() {
    const els = [];
    const sel = K.LANGS.map(L => `[${A}="${L}"]`).join(',');
    const collect = r => { try { r.querySelectorAll(sel).forEach(el => els.push(el)); } catch (e) { /* ignore */ } };
    collect(document); forEachRoot(collect);
    const ids = els.map(el => stackId(captureFF(el)));
    els.forEach((el, i) => el.setAttribute(A, el.getAttribute(A) + ids[i]));
  }

  function onMutations(list) {
    for (const m of list) {
      if (m.type === 'characterData') queue.add(m.target);
      else for (const n of m.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) queue.add(n);
    }
    schedule();
  }

  function schedule() {
    if (scheduled || !queue.size) return;
    scheduled = true;
    Promise.resolve().then(run);
  }

  function run() {
    scheduled = false;
    if (!active) { queue.clear(); return; }
    const t0 = performance.now();
    for (const n of queue) {
      queue.delete(n);
      if (n.isConnected !== false) scanTree(n);
      if (performance.now() - t0 > 12) break;
    }
    flush();
    if (queue.size) { scheduled = true; setTimeout(run, 16); }
  }

  function rescanAll() {
    queue.add(document);
    forEachRoot(r => queue.add(r));
    schedule();
  }

  function start() {
    started = true;
    if (!mo) mo = new MutationObserver(onMutations);
    mo.observe(document, MO_OPTS);
    forEachRoot(r => mo.observe(r, MO_OPTS));
    scanTree(document);
    flush();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { if (active) rescanAll(); }, { once: true });
    }
  }

  function stop() {
    started = false;
    if (mo) mo.disconnect();
    queue.clear(); pending.clear();
  }

  /* ───────────────────────── settings ───────────────────────── */

  function report() {
    if (!IS_TOP) return;
    const off = !S.enabled || K.siteOff(S, host);
    api.runtime.sendMessage({ t: 'state', text: off ? 'off' : paused ? 'orig' : '' }).catch(() => {});
  }

  function applyAll(rescan) {
    active = !!S && S.enabled && !paused && !K.siteOff(S, host);
    report();
    if (!active) {
      if (started) stop();
      applyCSS();
      syncFacesSoon();
      return;
    }
    if (needFont()) recaptureAll();
    applyCSS();
    Styles.ensure();
    syncFacesSoon();
    if (!started) start();
    else if (rescan) rescanAll();
  }

  function onSettings(raw) {
    const prev = S;
    S = K.sanitize(raw);
    const rescan = !!prev && (prev.threshold !== S.threshold || prev.styleFields !== S.styleFields);
    applyAll(rescan);
  }

  function fallbackHost() {
    if (IS_TOP) return K.hostOf(location.href);
    try {
      const ao = location.ancestorOrigins;
      if (ao && ao.length) return K.hostOf(ao[ao.length - 1]);
    } catch (e) { /* ignore */ }
    return K.hostOf(location.href);
  }

  async function boot() {
    Styles.init();
    document.addEventListener('alfaaz:shadow', e => {
      const t = e.target;
      if (t && t.nodeType === 1) queueMicrotask(() => { const r = t.shadowRoot || closedRoot(t); if (r) watchRoot(r); });
    }, true);
    document.addEventListener('input', e => {
      if (!active) return;
      const t = (e.composedPath && e.composedPath()[0]) || e.target;
      if (t && t.nodeType === 1 && isField(t)) { pending.add(t); flush(); }
    }, true);

    const [r, hello] = await Promise.all([
      api.storage.local.get(['settings', 'library']),
      api.runtime.sendMessage({ t: 'hello' }).catch(() => null),
    ]);
    host = (hello && hello.ok && hello.host) || fallbackHost();
    lib = r.library || {};
    booted = true;
    onSettings(r.settings);

    api.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.library) { lib = ch.library.newValue || {}; if (active) syncFacesSoon(); }
      if (ch.settings) onSettings(ch.settings.newValue);
    });

    api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !booted) return false;
      if (msg.t === 'pause') { paused = !paused; applyAll(false); }
      if ((msg.t === 'pause' || msg.t === 'status') && IS_TOP) sendResponse({ paused });
      return false;
    });

    // Some pages reset adoptedStyleSheets or remove injected nodes; put the fallback sheet back.
    setInterval(() => { if (active && !document.hidden) Styles.ensure(); }, 3000);
  }

  boot().catch(() => {});
})();
