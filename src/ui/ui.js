/* Alfaaz — shared interface code for the popup and the settings page. */
var UI = (() => {
  'use strict';
  const K = Alfaaz, api = K.api;

  /* ── DOM ── */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  // Lucide icons, 16px, 1.5 stroke.
  const ICONS = {
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  };
  const parser = new DOMParser();
  function icon(name) {
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`, 'image/svg+xml');
    const s = document.importNode(doc.documentElement, true);
    s.setAttribute('class', 'icon'); s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /* ── state shared by every view on the page ── */
  const state = { settings: K.sanitize({}), library: {}, samples: {}, detected: null };
  const listeners = new Set();
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = what => listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });

  async function load() {
    const r = await api.storage.local.get(['settings', 'library', 'samples']);
    state.settings = K.sanitize(r.settings);
    state.library = r.library || {};
    state.samples = r.samples || {};
    api.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.library) { state.library = ch.library.newValue || {}; emit('library'); }
      if (ch.settings && !writeTimer) {
        const next = K.sanitize(ch.settings.newValue);
        if (JSON.stringify(next) !== JSON.stringify(state.settings)) { state.settings = next; emit('settings'); }
      }
    });
    return state;
  }

  let writeTimer = 0;
  function update(fn, immediate) {
    const s = structuredClone(state.settings);
    fn(s);
    state.settings = K.sanitize(s);
    emit('settings');
    clearTimeout(writeTimer);
    const write = () => { writeTimer = 0; api.storage.local.set({ settings: state.settings }); };
    if (immediate) write(); else writeTimer = setTimeout(write, 60);
  }

  let sampleTimer = 0;
  function setSample(L, text) {
    state.samples[L] = text;
    clearTimeout(sampleTimer);
    sampleTimer = setTimeout(() => api.storage.local.set({ samples: state.samples }), 300);
  }

  /* ── fonts ── */
  function detectInstalled(names) {
    const found = new Set();
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      const text = K.SAMPLES.u + K.SAMPLES.a;
      const bases = ['monospace', 'serif', 'sans-serif'];
      const w = f => { ctx.font = f; return ctx.measureText(text).width; };
      const ref = bases.map(b => w(`40px ${b}`));
      for (const n of names) if (bases.some((b, i) => w(`40px "${K.cssStr(n)}", ${b}`) !== ref[i])) found.add(n);
    } catch (e) { /* canvas blocked */ }
    return found;
  }

  function ensureDetected() {
    if (!state.detected) state.detected = detectInstalled(K.LOCAL_FONTS.map(f => f[0]));
    return state.detected;
  }

  function fontName(id) {
    if (!id) return 'Page font';
    const meta = state.library[id];
    if (meta) return meta.family;
    return K.nameOf(id);
  }

  // Everything the pickers can offer, grouped. Hidden built-ins only appear with showHidden.
  function catalog(showHidden) {
    const s = state.settings, lib = state.library, det = ensureDetected();
    const hidden = new Set(s.hidden);
    const keep = id => showHidden || !hidden.has(id);
    const googleStyle = new Map(K.GOOGLE_FONTS);
    const localStyle = new Map(K.LOCAL_FONTS);
    const metas = Object.values(lib);
    const out = { downloaded: [], files: [], installed: [], custom: [], available: [], missing: [] };
    for (const m of metas) {
      const item = { id: m.id, name: m.family, style: googleStyle.get(m.family) || (m.source === 'file' ? 'Your file' : 'Google'), meta: m };
      if (m.source === 'file') out.files.push(item);
      else if (keep(m.id)) out.downloaded.push(item);
    }
    for (const [name, style] of K.GOOGLE_FONTS) {
      const id = 'g:' + name;
      if (!lib[id] && keep(id)) out.available.push({ id, name, style, builtin: true });
    }
    for (const c of s.customFonts) out.custom.push({ id: c.id, name: c.name, style: 'Installed', custom: true });
    const customNames = new Set(s.customFonts.map(c => c.name.toLowerCase()));
    for (const [name, style] of K.LOCAL_FONTS) {
      const id = 'l:' + name;
      if (customNames.has(name.toLowerCase()) || !keep(id)) continue;
      (det.has(name) ? out.installed : out.missing).push({ id, name, style, builtin: true });
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    Object.values(out).forEach(list => list.sort(byName));
    return out;
  }

  // Preview faces live in this extension page only.
  const previewFaces = new Map();
  async function previewFamily(key, fontId, sizePct) {
    const fam = 'Alfaaz Preview ' + key;
    const stamp = `${fontId}|${sizePct}|${(state.library[fontId] || {}).updated || 0}`;
    const cur = previewFaces.get(fam);
    if (cur && cur.stamp === stamp) return cur.result;
    const result = (async () => {
      if (cur) (await cur.faces).forEach(f => document.fonts.delete(f));
      if (!fontId) return { fam: null, ok: true };
      const desc = { unicodeRange: K.UNICODE_RANGE, display: 'block' };
      if (sizePct !== 100) desc.sizeAdjust = sizePct + '%';
      let faces = [];
      const kind = K.kindOf(fontId);
      if (kind === 'local') faces = [new FontFace(fam, K.localSrc(K.localNames(fontId, state.settings)), desc)];
      else {
        const rec = await FontStore.get(fontId).catch(() => null);
        if (!rec) return { fam: null, ok: false, missing: true };
        faces = rec.faces.map(f => new FontFace(fam, f.data, Object.assign({}, desc, { weight: f.weight, style: f.style })));
      }
      faces.forEach(f => document.fonts.add(f));
      const loaded = await Promise.all(faces.map(f => f.load().then(() => true, () => false)));
      entry.facesResolved = faces;
      return { fam, ok: loaded.some(Boolean) };
    })();
    const entry = { stamp, result, faces: result.then(() => entry.facesResolved || [], () => []) };
    previewFaces.set(fam, entry);
    return result;
  }

  async function fontStatus(fontId) {
    if (!fontId) return { text: 'Pages keep their own font. Pick one to change size too.' };
    const kind = K.kindOf(fontId), meta = state.library[fontId];
    if (kind === 'google') {
      if (!meta) return { text: 'Downloads the first time a page needs it', action: 'download' };
      return { text: `Downloaded · ${K.formatBytes(meta.bytes)}` };
    }
    if (kind === 'file') return meta ? { text: `Your font file · ${K.formatBytes(meta.bytes)}` } : { text: 'This font file was removed', bad: true };
    const r = await previewFamily('check', fontId, 100);
    return r.ok ? { text: 'Installed on this device' } : { text: 'Not found on this device. Check the exact name in the font library.', bad: true };
  }

  function fontSelect(value, onpick) {
    const sel = h('select', { class: 'select', 'aria-label': 'Font' });
    const fill = () => {
      const c = catalog(false);
      const opt = it => h('option', { value: it.id }, it.style && it.style !== 'Installed' ? `${it.name} · ${it.style}` : it.name);
      const group = (label, list) => (list.length ? h('optgroup', { label }, list.map(opt)) : null);
      sel.replaceChildren(
        h('option', { value: '' }, 'Page font (no change)'),
        group('Downloaded', c.downloaded), group('Your font files', c.files),
        group('Your installed fonts', c.custom), group('Installed on this device', c.installed),
        group('Free to download', c.available), group('Not found on this device', c.missing),
      );
      const cur = sel.dataset.value || '';
      if (cur && ![...sel.options].some(o => o.value === cur)) sel.append(h('option', { value: cur }, fontName(cur)));
      sel.value = cur;
    };
    sel.addEventListener('change', () => { sel.dataset.value = sel.value; onpick(sel.value); });
    sel.setValue = v => { sel.dataset.value = v || ''; fill(); };
    sel.refill = fill;
    sel.setValue(value);
    return sel;
  }

  /* ── the profile editor: preview, font and the four sliders ── */
  const SLIDERS = [
    { key: 'sizePct', name: 'Size', unit: '%', min: 50, max: 250, step: 1, fmt: v => String(Math.round(v)) },
    { key: 'letterEm', name: 'Letter spacing', unit: 'em', min: -0.1, max: 0.5, step: 0.005, fmt: v => v.toFixed(3), page: true },
    { key: 'wordEm', name: 'Word spacing', unit: 'em', min: -0.2, max: 1, step: 0.01, fmt: v => v.toFixed(2), page: true },
    { key: 'lineHeight', name: 'Line height', unit: '×', min: 1, max: 4, step: 0.05, fmt: v => v.toFixed(2), page: true, snapLow: 0.95 },
  ];

  function ProfileEditor(opts) {
    const big = !!opts.big;
    let L = 'u';
    const root = h('div', { class: 'editor' });

    const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Profile' });
    const tabBtns = {};
    for (const key of K.LANGS) {
      tabBtns[key] = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { L = key; render(); opts.onLang && opts.onLang(L); } }, K.LANG_NAMES[key]);
      tabs.append(tabBtns[key]);
    }
    const single = h('span', { class: 'label' }, 'All Arabic-script text');
    const head = h('div', { class: 'head' }, tabs, single, opts.headExtra || null);

    const paper = h('div', { class: 'paper' });
    const ink = h('div', { class: 'ink', dir: 'rtl', contenteditable: 'plaintext-only', spellcheck: 'false', 'aria-label': 'Sample text, editable' });
    const mix = h('div', { class: 'ink', dir: 'rtl' });
    paper.append(ink, mix);
    ink.addEventListener('input', () => setSample(L, ink.textContent));
    const sampleNote = h('p', { class: 'note' }, 'Type in the sample to try your own text. ',
      h('a', { href: '#', onclick: e => { e.preventDefault(); setSample(state.settings.separateArabic ? L : 'u', ''); ink.blur(); render(); } }, 'Restore sample'));

    const sel = fontSelect(state.settings.profiles.u.font, v => update(s => { prof(s).font = v; }, true));
    const status = h('div', { class: 'status', role: 'status' });
    const fontpick = h('div', { class: 'fontpick' }, sel, status);

    const sliderEls = SLIDERS.map(cfg => {
      const range = h('input', { type: 'range', min: cfg.snapLow || cfg.min, max: cfg.max, step: cfg.step, 'aria-label': cfg.name });
      const val = h('input', { class: 'val', type: 'text', inputmode: 'decimal', 'aria-label': cfg.name + ' value' });
      const unit = h('span', { class: 'unit' });
      const reset = h('button', { class: 'iconbtn', type: 'button', title: 'Reset ' + cfg.name.toLowerCase(), 'aria-label': 'Reset ' + cfg.name.toLowerCase() }, icon('reset'));
      const note = h('p', { class: 'note' });
      const set = v => update(s => { prof(s)[cfg.key] = v; });
      range.addEventListener('input', () => {
        let v = Number(range.value);
        if (cfg.snapLow && v < cfg.min) v = 0;
        set(v);
      });
      val.addEventListener('change', () => {
        const t = val.value.trim().toLowerCase();
        if (cfg.page && (t === '' || t === 'page')) return set(0);
        const v = parseFloat(t);
        if (Number.isFinite(v)) set(v); else paint();
      });
      reset.addEventListener('click', () => set(K.PROFILE_DEFAULTS[L][cfg.key]));
      const row = h('div', { class: 'slider' }, h('div', { class: 'row' }, h('label', { class: 'name' }, cfg.name), val, unit, reset), range, note);
      function paint() {
        const p = prof(state.settings), v = p[cfg.key];
        const off = cfg.page && v === 0;
        range.value = off ? (cfg.snapLow || 0) : v;
        val.value = off ? 'page' : cfg.fmt(v);
        unit.textContent = off ? '' : cfg.unit;
        if (cfg.key === 'sizePct') {
          const dis = !p.font;
          range.disabled = dis; val.disabled = dis;
          note.textContent = dis ? 'Choose a font to change the size.' : '';
        } else if (cfg.key === 'letterEm') note.textContent = v ? 'Letter spacing pulls joined Arabic letters apart. Word spacing is the safer way to open text up.' : '';
        else if (cfg.key === 'lineHeight') note.textContent = '';
        note.hidden = !note.textContent;
      }
      return { row, paint };
    });
    const sliders = h('div', { class: 'sliders' }, sliderEls.map(s => s.row));

    root.append(head, paper, sampleNote, fontpick, sliders);

    function prof(s) { return s.separateArabic ? s.profiles[L] : s.profiles.u; }

    let paintId = 0;
    async function paintPreview() {
      const id = ++paintId;
      const s = state.settings, p = prof(s);
      const key = s.separateArabic ? L : 'u';
      const sample = state.samples[key] || (key === 'a' ? K.SAMPLES.a : K.SAMPLES.u);
      if (document.activeElement !== ink && ink.textContent !== sample) ink.textContent = sample;
      mix.textContent = s.separateArabic && L === 'a' ? '' : K.SAMPLES.mix;
      mix.hidden = !mix.textContent;
      const base = big ? 24 : 20;
      const lh = p.lineHeight || 1.9;
      paper.style.setProperty('--lh', Math.round(base * lh) + 'px');
      for (const el of [ink, mix]) {
        el.style.fontSize = base + 'px';
        el.style.lineHeight = Math.round(base * lh) + 'px';
        el.style.letterSpacing = p.letterEm ? p.letterEm + 'em' : '';
        el.style.wordSpacing = p.wordEm ? p.wordEm + 'em' : '';
      }
      const st = await fontStatus(p.font);
      if (id !== paintId) return;
      status.classList.toggle('bad', !!st.bad);
      status.replaceChildren(h('span', null, st.text));
      if (st.action === 'download') {
        const b = h('button', { class: 'btn small', type: 'button' }, icon('download'), 'Download now');
        b.addEventListener('click', async () => {
          b.disabled = true; b.lastChild.textContent = 'Downloading';
          const r = await api.runtime.sendMessage({ t: 'download', id: p.font }).catch(e => ({ ok: false, error: String(e) }));
          if (!r || !r.ok) { status.classList.add('bad'); status.replaceChildren(h('span', null, `Download failed: ${(r && r.error) || 'no connection'}`)); }
        });
        status.append(b);
      }
      const r = await previewFamily(big ? 'big' : 'pop', p.font, p.sizePct);
      if (id !== paintId) return;
      const ff = r.fam ? `"${r.fam}", system-ui, sans-serif` : '';
      ink.style.fontFamily = ff; mix.style.fontFamily = ff;
    }

    function render() {
      const s = state.settings;
      tabs.hidden = !s.separateArabic;
      single.hidden = s.separateArabic;
      if (!s.separateArabic) L = 'u';
      for (const key of K.LANGS) tabBtns[key].setAttribute('aria-pressed', String(key === L));
      if (document.activeElement !== sel) sel.setValue(prof(s).font);
      sliderEls.forEach(x => x.paint());
      paintPreview();
    }

    onChange(what => { if (what === 'library') sel.refill(); render(); });
    render();
    root.lang = () => L;
    return root;
  }

  async function activeTab() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function hasAccess() {
    try { return await api.permissions.contains({ origins: ['<all_urls>'] }); } catch (e) { return true; }
  }

  function accessBanner(onGranted) {
    const b = h('div', { class: 'banner', role: 'alert', hidden: true },
      h('div', null, h('p', null, 'Alfaaz needs access to websites to restyle their text'),
        h('p', { class: 'note' }, 'Your browser asks for this once. Alfaaz reads nothing and sends nothing anywhere.')),
      h('button', { class: 'btn primary small', type: 'button', onclick: async () => {
        const ok = await api.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
        if (ok) { b.hidden = true; onGranted && onGranted(); }
      } }, 'Allow on all websites'));
    hasAccess().then(ok => { b.hidden = ok; });
    return b;
  }

  return { h, icon, state, load, update, onChange, emit, setSample, catalog, ensureDetected, detectInstalled, fontName, fontSelect, previewFamily, ProfileEditor, activeTab, accessBanner };
})();
