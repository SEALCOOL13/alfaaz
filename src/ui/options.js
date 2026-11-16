(async () => {
  'use strict';
  const K = Alfaaz, api = K.api, { h, icon, state } = UI;
  const app = document.getElementById('app');
  await UI.load();

  const section = (id, title, sub, ...body) => h('section', { id, 'aria-labelledby': id + '-h' },
    h('header', null, h('h2', { id: id + '-h' }, title), sub ? h('p', { class: 'sub' }, sub) : null), ...body);

  /* ───────────── Look ───────────── */
  let editLang = 'u';
  const editor = UI.ProfileEditor({ big: true, onLang: L => { editLang = L; paintLibrary(); } });
  const look = section('look', 'Look', 'How Urdu and Arabic text appears on every site. Changes show up on open pages right away.',
    h('div', { class: 'card look' }, editor));

  /* ───────────── Font library ───────────── */
  const summary = h('span', { class: 'summary' });
  const dlAll = h('button', { class: 'btn primary', type: 'button' }, icon('download'), 'Download all');
  const rmAll = h('button', { class: 'btn quiet', type: 'button' }, 'Remove all downloads');
  const progBar = h('span');
  const progText = h('p', { class: 'note' });
  const progress = h('div', { class: 'progress', hidden: true }, h('div', { class: 'bar' }, progBar), progText);

  const nameField = h('input', { class: 'field', type: 'text', list: 'alfaaz-local', placeholder: 'Font name, for example Jameel Noori Nastaleeq', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Font name' });
  const localList = h('datalist', { id: 'alfaaz-local' });
  const fileInput = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', multiple: true, hidden: true });
  const feedback = h('p', { class: 'note feedback', role: 'status' });
  const say = (text, bad) => { feedback.textContent = text; feedback.classList.toggle('bad', !!bad); };
  const findBtn = typeof window.queryLocalFonts === 'function'
    ? h('button', { class: 'btn', type: 'button', onclick: findInstalled }, icon('search'), 'Find installed fonts') : null;

  const adder = h('div', { class: 'card adder' },
    h('h3', null, 'Add a font'),
    h('div', { class: 'row' }, nameField, localList),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: addInstalled }, icon('plus'), 'Add installed font'),
      h('button', { class: 'btn', type: 'button', onclick: addGoogle }, icon('download'), 'Add from Google Fonts'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Add font files'),
      findBtn, fileInput),
    feedback);

  const filterField = h('input', { class: 'field', type: 'search', placeholder: 'Filter by name or style', 'aria-label': 'Filter fonts' });
  const showHidden = h('input', { type: 'checkbox', role: 'switch' });
  const filter = h('div', { class: 'filter' }, filterField, h('label', null, h('span', { class: 'switch' }, showHidden, h('span')), 'Show hidden fonts'));
  const groups = h('div', { class: 'groups', style: { display: 'grid', gap: '16px' } });

  const fonts = section('fonts', 'Font library',
    'Download free fonts once and they work everywhere, even offline and on sites that block outside fonts. You can also use fonts installed on this device or add your own font files.',
    h('div', { class: 'lib-top' }, summary, rmAll, dlAll), progress, adder, filter, groups);

  filterField.addEventListener('input', paintLibrary);
  showHidden.addEventListener('change', paintLibrary);
  fileInput.addEventListener('change', () => addFiles([...fileInput.files]).finally(() => { fileInput.value = ''; }));

  function inUse(id) {
    const s = state.settings, out = [];
    if (s.profiles.u.font === id) out.push(s.separateArabic ? 'Urdu' : 'In use');
    if (s.separateArabic && s.profiles.a.font === id) out.push('Arabic');
    return out;
  }

  function useFont(id) {
    UI.update(s => { (s.separateArabic ? s.profiles[editLang] : s.profiles.u).font = id; }, true);
    document.getElementById('look').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function dropFromProfiles(id) {
    UI.update(s => { for (const L of K.LANGS) if (s.profiles[L].font === id) s.profiles[L].font = ''; }, true);
  }

  // Each row draws its own sample in its own font, loaded only when the row scrolls into view.
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const el = e.target;
      UI.previewFamily('lib-' + el.dataset.id, el.dataset.id, 100).then(r => {
        if (r.fam && r.ok) { el.style.fontFamily = `"${r.fam}", system-ui`; el.classList.remove('none'); }
        else { el.textContent = K.kindOf(el.dataset.id) === 'local' ? 'Not on this device' : 'Not downloaded'; el.classList.add('none'); }
      });
    }
  }, { rootMargin: '200px' });

  function row(item, kind) {
    const s = state.settings;
    const hidden = s.hidden.includes(item.id);
    const meta = item.meta;
    const sample = h('div', { class: 'sample', dir: 'rtl', lang: 'ur', 'data-id': item.id }, 'اردو الفاظ');
    const canPreview = kind !== 'available';
    if (canPreview) seen.observe(sample); else { sample.textContent = ''; sample.classList.add('blank'); }

    const metaText = [item.style, meta ? K.formatBytes(meta.bytes) : null].filter(Boolean).join(' · ');
    const name = h('span', { class: 'n' }, item.name);
    const who = h('div', { class: 'who' }, name, h('span', { class: 'm' }, metaText));
    const use = inUse(item.id);
    if (use.length) who.append(h('span', { class: 'in-use' }, use.join(' and ')));

    const acts = h('div', { class: 'acts' });
    const btn = (label, ic, fn, cls) => h('button', { class: 'btn small ' + (cls || 'quiet'), type: 'button', onclick: fn }, ic ? icon(ic) : null, label);
    const useLabel = s.separateArabic ? `Use for ${editLang === 'u' ? 'Urdu' : 'Arabic'}` : 'Use';

    if (hidden) {
      acts.append(btn('Unhide', 'eye', () => UI.update(x => { x.hidden = x.hidden.filter(i => i !== item.id); }, true)));
      return h('div', { class: 'font-row' }, sample, who, acts);
    }
    if (kind === 'available') {
      acts.append(btn('Download', 'download', async e => {
        const b = e.currentTarget; b.disabled = true; b.lastChild.textContent = 'Downloading';
        try { await FontStore.downloadGoogle(item.name); }
        catch (err) { b.disabled = false; b.lastChild.textContent = 'Download'; say(`${item.name} didn’t download: ${err.message}. Check your connection and try again.`, true); }
      }, ''));
      acts.append(btn('', 'eyeoff', () => UI.update(x => { x.hidden.push(item.id); }, true)));
      acts.lastChild.title = 'Hide from font lists'; acts.lastChild.setAttribute('aria-label', 'Hide ' + item.name);
    } else {
      acts.append(btn(useLabel, null, () => useFont(item.id)));
      if (kind === 'downloaded') {
        const builtin = K.GOOGLE_FONTS.some(([n]) => n === item.name);
        acts.append(iconBtn('trash', builtin ? 'Remove download' : 'Remove font', async () => {
          await FontStore.remove(item.id);
          if (!builtin) dropFromProfiles(item.id);
          say(builtin ? `Removed the download of ${item.name}. It downloads again if a profile uses it.` : `Removed ${item.name}.`);
        }));
      } else if (kind === 'files') {
        acts.append(iconBtn('pencil', 'Rename', () => {
          const input = h('input', { class: 'rename', value: item.name, 'aria-label': 'New name' });
          const done = async ok => { if (ok && input.value.trim()) await FontStore.rename(item.id, input.value); else paintLibrary(); };
          input.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
          input.addEventListener('blur', () => done(true));
          name.replaceWith(input); input.focus(); input.select();
        }));
        acts.append(iconBtn('trash', 'Remove font file', async () => { await FontStore.remove(item.id); dropFromProfiles(item.id); say(`Removed ${item.name}.`); }));
      } else if (kind === 'custom') {
        acts.append(iconBtn('trash', 'Remove from list', () => {
          UI.update(x => { x.customFonts = x.customFonts.filter(c => c.id !== item.id); for (const L of K.LANGS) if (x.profiles[L].font === item.id) x.profiles[L].font = ''; }, true);
        }));
      } else {
        acts.append(iconBtn('eyeoff', 'Hide from font lists', () => UI.update(x => { x.hidden.push(item.id); }, true)));
      }
    }
    return h('div', { class: 'font-row' }, sample, who, acts);
  }

  function iconBtn(ic, label, fn) {
    return h('button', { class: 'iconbtn', type: 'button', title: label, 'aria-label': label, onclick: fn }, icon(ic));
  }

  function paintLibrary() {
    const c = UI.catalog(showHidden.checked);
    const q = filterField.value.trim().toLowerCase();
    const match = it => !q || it.name.toLowerCase().includes(q) || (it.style || '').toLowerCase().includes(q);
    const total = K.GOOGLE_FONTS.length;
    const lib = Object.values(state.library);
    const downloaded = lib.filter(m => m.source === 'google').length;
    const bytes = lib.reduce((n, m) => n + (m.bytes || 0), 0);
    const left = c.available.length;
    summary.textContent = `${downloaded} downloaded · ${K.formatBytes(bytes)} used`;
    dlAll.disabled = !left || busy;
    dlAll.lastChild.textContent = left ? `Download all (${left})` : 'All downloaded';
    rmAll.hidden = !downloaded;

    const make = (title, list, kind, collapsed) => {
      list = list.filter(match);
      if (!list.length) return null;
      const rows = h('div', { class: 'rows' }, list.map(it => row(it, kind)));
      if (collapsed) {
        return h('details', { class: 'group' }, h('summary', null, h('h3', null, title), h('span', { class: 'count' }, String(list.length))), rows);
      }
      return h('div', { class: 'group' }, h('h3', null, title, ' ', h('span', { class: 'count' }, String(list.length))), rows);
    };
    seen.disconnect();
    groups.replaceChildren(...[
      make('Downloaded', c.downloaded, 'downloaded'),
      make('Your font files', c.files, 'files'),
      make('Your installed fonts', c.custom, 'custom'),
      make('Installed on this device', c.installed, 'installed'),
      make('Free to download', c.available, 'available'),
      make('Not found on this device', c.missing, 'missing', true),
      showHidden.checked ? make('Hidden', hiddenItems(), 'hidden') : null,
    ].filter(Boolean));
    if (!groups.children.length) groups.append(h('p', { class: 'empty' }, q ? `No fonts match “${filterField.value.trim()}”` : 'No fonts yet'));
  }

  function hiddenItems() {
    const g = new Map(K.GOOGLE_FONTS), l = new Map(K.LOCAL_FONTS);
    return state.settings.hidden.map(id => ({ id, name: K.nameOf(id), style: g.get(K.nameOf(id)) || l.get(K.nameOf(id)) || '' }));
  }

  let busy = false;
  dlAll.addEventListener('click', async () => {
    const todo = UI.catalog(false).available.map(it => it.name);
    if (!todo.length) return;
    busy = true; dlAll.disabled = true; progress.hidden = false;
    let done = 0;
    const failed = [];
    const paint = name => {
      progBar.style.width = `${Math.round((done / todo.length) * 100)}%`;
      progText.textContent = name ? `Downloading ${done + 1} of ${todo.length} · ${name}` : '';
    };
    const queue = todo.slice();
    paint(queue[0]);
    await Promise.all([0, 1, 2].map(async () => {
      while (queue.length) {
        const name = queue.shift();
        paint(name);
        try { await FontStore.downloadGoogle(name); } catch (e) { failed.push(name); }
        done++; paint(queue[0]);
      }
    }));
    busy = false; progress.hidden = true;
    if (failed.length) say(`${failed.length} of ${todo.length} didn’t download: ${failed.join(', ')}. Check your connection and press Download all again.`, true);
    else say(`Downloaded ${todo.length} fonts.`);
    paintLibrary();
  });

  let rmArmed = 0;
  rmAll.addEventListener('click', async () => {
    if (!rmArmed) {
      rmAll.textContent = 'Press again to remove';
      rmArmed = setTimeout(() => { rmArmed = 0; rmAll.textContent = 'Remove all downloads'; }, 3000);
      return;
    }
    clearTimeout(rmArmed); rmArmed = 0; rmAll.textContent = 'Remove all downloads';
    await FontStore.removeAll(m => m.source === 'google');
    say('Removed all downloaded fonts. Fonts a profile uses download again when a page needs them.');
  });

  async function addInstalled() {
    const name = nameField.value.trim();
    if (!name) return say('Type the font’s name first.', true);
    if (state.settings.customFonts.some(c => c.name.toLowerCase() === name.toLowerCase())) return say(`${name} is already in your list.`);
    const names = scanned.get(name.toLowerCase()) || [];
    UI.update(s => { s.customFonts.push({ id: 'l:' + name, name, names }); }, true);
    const r = await UI.previewFamily('add', 'l:' + name, 100);
    nameField.value = '';
    say(r.ok ? `Added ${name}.` : `Added ${name}, but this device doesn’t seem to have it. Check the spelling, or use Find installed fonts.`, !r.ok);
  }

  async function addGoogle() {
    const name = nameField.value.trim();
    if (!name) return say('Type a Google Fonts family name first, for example Noto Nastaliq Urdu.', true);
    say(`Downloading ${name}…`);
    try {
      await FontStore.downloadGoogle(name);
      nameField.value = '';
      say(`Added ${name}.`);
    } catch (e) { say(`Couldn’t add ${name}: ${e.message}.`, true); }
  }

  async function addFiles(files) {
    const added = [], bad = [], noArabic = [];
    for (const f of files) {
      if (f.size > 40 * 1024 * 1024) { bad.push(f.name); continue; }
      const buf = await f.arrayBuffer();
      const face = new FontFace('Alfaaz Check', buf);
      try { await face.load(); } catch (e) { bad.push(f.name); continue; }
      document.fonts.add(face);
      if (!UI.detectInstalled(['Alfaaz Check']).size) noArabic.push(f.name);
      document.fonts.delete(face);
      const rec = await FontStore.importFile(f.name, buf);
      added.push(rec.family);
    }
    const parts = [];
    if (added.length) parts.push(`Added ${added.join(', ')}.`);
    if (noArabic.length) parts.push(`${noArabic.join(', ')} ${noArabic.length > 1 ? 'have' : 'has'} no Arabic letters, so it won’t change anything.`);
    if (bad.length) parts.push(`Couldn’t read ${bad.join(', ')}. Use .ttf, .otf, .woff or .woff2 files.`);
    say(parts.join(' '), !!(bad.length || noArabic.length));
  }

  const scanned = new Map();
  async function findInstalled() {
    try {
      const list = await window.queryLocalFonts();
      const fam = new Map();
      for (const f of list) {
        const cur = fam.get(f.family);
        const regular = /^(regular|normal|book|roman)$/i.test(f.style);
        if (!cur || (regular && !cur.regular)) fam.set(f.family, { regular, names: [f.fullName, f.postscriptName].filter(Boolean) });
      }
      scanned.clear();
      localList.replaceChildren();
      for (const [k, v] of [...fam].sort((a, b) => a[0].localeCompare(b[0]))) {
        scanned.set(k.toLowerCase(), v.names);
        localList.append(h('option', { value: k }));
      }
      say(`Found ${fam.size} font families. Start typing a name in the box to pick one, then press Add installed font.`);
      nameField.focus();
    } catch (e) { say('The browser didn’t give permission to list fonts. You can still type a name.', true); }
  }

  /* ───────────── Mixed-language pages ───────────── */
  const tog = (key, title, note) => {
    const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': title });
    input.addEventListener('change', () => UI.update(s => { s[key] = input.checked; }, true));
    const el = h('div', { class: 'toggle' }, h('div', { class: 'text' }, h('span', null, title), h('span', { class: 'note' }, note)), h('label', { class: 'switch' }, input, h('span')));
    return { el, paint: () => { input.checked = !!state.settings[key]; } };
  };
  const toggles = [
    tog('enabled', 'Turn on everywhere', 'Off pauses Alfaaz on every site until you turn it back on.'),
    tog('separateArabic', 'Style Arabic and Persian separately from Urdu', ['Urdu is recognised by letters only it uses, like ', h('span', { class: 'glyphs', dir: 'rtl', lang: 'ur' }, 'ٹ ڈ ڑ ں ے'), '. Other Arabic-script text, such as Quranic verses or Persian, uses the Arabic profile.']),
    tog('alignRtl', 'Right-align Urdu and Arabic on left-to-right sites', 'Paragraphs and comments that are mostly Urdu or Arabic flow right to left, with punctuation on the correct side. Centred text stays centred.'),
    tog('styleFields', 'Style text boxes and editors', 'Includes search boxes, comment fields and rich text editors.'),
  ];
  const thr = h('input', { type: 'range', min: 5, max: 100, step: 5, 'aria-label': 'Mostly-Arabic threshold' });
  const thrVal = h('span', { class: 'num' });
  thr.addEventListener('input', () => UI.update(s => { s.threshold = Number(thr.value); }));
  const pages = section('pages', 'Mixed-language pages',
    'The font only ever changes Arabic-script letters, so English, numbers and other scripts keep the site’s own font. Spacing and line height need more care, because they apply to whole elements.',
    h('div', { class: 'card toggles' }, toggles.map(t => t.el)),
    h('div', { class: 'card slider-card' },
      h('div', { class: 'row' }, h('span', null, 'Spacing and line height apply when text is at least'), thrVal),
      thr,
      h('p', { class: 'note' }, 'A mostly English paragraph with one Urdu word keeps its spacing and line height. Lower this if mixed Urdu and English text should get your settings too.')));

  /* ───────────── Sites ───────────── */
  const siteList = h('div', { class: 'sitelist' });
  const siteField = h('input', { class: 'field', type: 'text', placeholder: 'example.com', 'aria-label': 'Site to turn off' });
  const addSite = () => {
    const v = siteField.value.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '');
    if (!v) return;
    UI.update(s => { if (!s.disabledHosts.includes(v)) s.disabledHosts.push(v); }, true);
    siteField.value = '';
  };
  siteField.addEventListener('keydown', e => { if (e.key === 'Enter') addSite(); });
  const sites = section('sites', 'Sites', 'Alfaaz stays off on these sites and their subdomains. You can also turn a site off from the toolbar button.',
    h('div', { class: 'rows' }, siteList),
    h('div', { class: 'actions' }, h('div', { style: { flex: '1 1 240px' } }, siteField), h('button', { class: 'btn', type: 'button', onclick: addSite }, icon('plus'), 'Turn off for site')));

  /* ───────────── Shortcuts ───────────── */
  const keyList = h('div', { class: 'keys' });
  const isFirefox = typeof browser !== 'undefined' && navigator.userAgent.includes('Firefox');
  const keys = section('keys', 'Shortcuts', null, h('div', { class: 'rows' }, keyList),
    isFirefox
      ? h('p', { class: 'note' }, 'To change them, open about:addons, press the gear button and choose Manage Extension Shortcuts.')
      : h('div', null, h('button', { class: 'btn', type: 'button', onclick: () => api.tabs.create({ url: 'chrome://extensions/shortcuts' }) }, icon('external'), 'Change shortcuts')));
  (async () => {
    let cmds = [];
    try { cmds = await api.commands.getAll(); } catch (e) { /* ignore */ }
    for (const c of cmds) {
      if (!c.description) continue;
      const k = c.shortcut ? c.shortcut.split('+').map(x => h('kbd', null, x)) : [h('span', { class: 'muted' }, 'Not set')];
      keyList.append(h('div', { class: 'keyrow' }, h('span', null, c.description), h('span', null, k)));
    }
  })();

  /* ───────────── Backup ───────────── */
  const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const backupNote = h('p', { class: 'note', role: 'status' });
  let resetArmed = 0;
  const resetBtn = h('button', { class: 'btn quiet danger', type: 'button' }, 'Reset all settings');
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetBtn.textContent = 'Press again to reset';
      resetArmed = setTimeout(() => { resetArmed = 0; resetBtn.textContent = 'Reset all settings'; }, 3000);
      return;
    }
    clearTimeout(resetArmed); resetArmed = 0; resetBtn.textContent = 'Reset all settings';
    UI.update(s => { Object.keys(s).forEach(k => delete s[k]); }, true);
    backupNote.textContent = 'Settings reset. Downloaded fonts and font files are kept.';
  });
  importInput.addEventListener('change', async () => {
    const f = importInput.files[0];
    importInput.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const s = data && data.settings ? data.settings : data;
      if (!s || typeof s !== 'object' || !s.profiles) throw new Error('bad');
      UI.update(x => { Object.keys(x).forEach(k => delete x[k]); Object.assign(x, s); }, true);
      if (data.samples) { state.samples = data.samples; api.storage.local.set({ samples: data.samples }); }
      backupNote.textContent = `Imported settings from ${f.name}.`;
    } catch (e) { backupNote.textContent = `${f.name} isn’t a Alfaaz settings file.`; }
  });
  const backup = section('backup', 'Backup', 'Settings, site list and samples, as one file. Font files stay in this browser.',
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: exportSettings }, icon('download'), 'Export settings'),
      h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, icon('upload'), 'Import settings'),
      resetBtn, importInput),
    backupNote);

  function exportSettings() {
    const blob = new Blob([JSON.stringify({ app: 'alfaaz', v: 2, settings: state.settings, samples: state.samples }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `alfaaz-settings-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    backupNote.textContent = 'Settings exported.';
  }

  /* ───────────── assemble ───────────── */
  app.append(UI.accessBanner(), look, fonts, pages, sites, keys, backup);
  app.removeAttribute('aria-busy');

  function paintSettings() {
    toggles.forEach(t => t.paint());
    thr.value = state.settings.threshold;
    thrVal.textContent = state.settings.threshold + '% Urdu or Arabic';
    siteList.replaceChildren(...(state.settings.disabledHosts.length
      ? state.settings.disabledHosts.map(host => h('div', { class: 'siterow' }, h('span', null, host),
        iconBtn('x', 'Turn Alfaaz back on for ' + host, () => UI.update(s => { s.disabledHosts = s.disabledHosts.filter(x => x !== host); }, true))))
      : [h('p', { class: 'empty' }, 'Alfaaz is on for every site')]));
  }

  // Repaint the library only when something it shows changed, not on every slider step.
  const libKey = () => { const s = state.settings; return JSON.stringify([s.hidden, s.customFonts, s.separateArabic, s.profiles.u.font, s.profiles.a.font]); };
  let lastLibKey = libKey();
  UI.onChange(what => {
    paintSettings();
    const k = libKey();
    if (what === 'library' || k !== lastLibKey) { lastLibKey = k; paintLibrary(); }
  });
  paintSettings();
  paintLibrary();

  // Keep the side navigation in step with scrolling.
  const navLinks = [...document.querySelectorAll('.side > a')];
  const spy = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach(a => a.setAttribute('aria-current', String(a.hash === '#' + e.target.id)));
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  document.querySelectorAll('main > section').forEach(s => spy.observe(s));
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})();
