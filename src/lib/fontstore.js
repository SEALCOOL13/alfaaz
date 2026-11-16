/* Alfaaz — font store.
 * Font files live in IndexedDB on the extension's own origin (shared by the background, popup and settings page).
 * A small index of what is stored lives in storage.local under "library", so every part of the extension,
 * including content scripts, can see what changed without touching the font bytes. */
var FontStore = (() => {
  'use strict';
  const K = Alfaaz, api = K.api;
  const DB = 'alfaaz-fonts', STORE = 'fonts';
  let dbp = null;
  let metaChain = Promise.resolve();
  const inflight = new Map();

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => { d.close(); dbp = null; };
        resolve(d);
      };
      req.onerror = () => { dbp = null; reject(req.error); };
    });
    return dbp;
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      let out;
      Promise.resolve(fn(st)).then(r => { out = r; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    });
  }

  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const get = id => tx('readonly', st => req2p(st.get(id)));
  const put = rec => tx('readwrite', st => { st.put(rec); });
  const del = id => tx('readwrite', st => { st.delete(id); });

  async function library() {
    const r = await api.storage.local.get('library');
    return r.library && typeof r.library === 'object' ? r.library : {};
  }

  // Serialised read-modify-write, so parallel downloads don't overwrite each other's entries.
  function editLibrary(fn) {
    metaChain = metaChain.then(async () => {
      const lib = await library();
      fn(lib);
      await api.storage.local.set({ library: lib });
    }).catch(() => {});
    return metaChain;
  }

  /* ── Google Fonts ── */

  async function fetchText(url) {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(r.status === 400 ? 'Google Fonts has no font with that name' : 'HTTP ' + r.status);
    return r.text();
  }

  async function fetchBuf(url) {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  }

  async function googleCSS(family) {
    const fam = encodeURIComponent(family.trim()).replace(/%20/g, '+');
    let last;
    for (const axis of [':wght@400;700', ':wght@400', '']) {
      try { return await fetchText(`https://fonts.googleapis.com/css2?family=${fam}${axis}&display=swap`); }
      catch (e) { last = e; }
    }
    throw last;
  }

  // Keep only the faces that carry Arabic script.
  function parseFaces(css) {
    const all = [];
    const re = /(?:\/\*\s*([^*]*?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const label = (m[1] || '').toLowerCase(), body = m[2];
      const url = (/src:[^;]*?url\(\s*['"]?([^'")\s]+)['"]?\s*\)/.exec(body) || [])[1];
      if (!url) continue;
      const range = (/unicode-range:\s*([^;]+)/i.exec(body) || [])[1] || '';
      const weight = ((/font-weight:\s*([^;]+)/i.exec(body) || [])[1] || '400').trim();
      const style = ((/font-style:\s*([^;]+)/i.exec(body) || [])[1] || 'normal').trim();
      const arabic = /arabic/.test(label) || /U\+0?6[0-9a-f]{2}/i.test(range) || (!label && !range);
      all.push({ url, weight, style, arabic });
    }
    const ar = all.filter(f => f.arabic);
    return ar.length ? ar : all;
  }

  async function downloadGoogle(family) {
    family = family.trim();
    const id = 'g:' + family;
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      const faces = parseFaces(await googleCSS(family));
      if (!faces.length) throw new Error('no font files found');
      const urls = [...new Set(faces.map(f => f.url))];
      const bufs = new Map();
      await Promise.all(urls.map(async u => { bufs.set(u, await fetchBuf(u)); }));
      let bytes = 0;
      for (const b of bufs.values()) bytes += b.byteLength;
      const rec = {
        id, family, source: 'google', updated: Date.now(), bytes,
        faces: faces.map(f => ({ weight: f.weight, style: f.style, data: bufs.get(f.url) })),
      };
      await put(rec);
      await editLibrary(lib => { lib[id] = { id, family, source: 'google', bytes, updated: rec.updated }; });
      return rec;
    })();
    inflight.set(id, p);
    p.then(() => inflight.delete(id), () => inflight.delete(id));
    return p;
  }

  /* ── Font files the person adds ── */

  async function importFile(name, data) {
    const id = 'f:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const family = name.replace(/\.(ttf|otf|woff2?|ttc)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Font';
    const rec = { id, family, source: 'file', updated: Date.now(), bytes: data.byteLength, faces: [{ weight: '400', style: 'normal', data }] };
    await put(rec);
    await editLibrary(lib => { lib[id] = { id, family, source: 'file', bytes: rec.bytes, updated: rec.updated }; });
    return rec;
  }

  async function rename(id, family) {
    family = String(family).trim().slice(0, 120);
    if (!family) return;
    const rec = await get(id);
    if (rec) { rec.family = family; await put(rec); }
    await editLibrary(lib => { if (lib[id]) lib[id].family = family; });
  }

  async function remove(id) {
    await del(id);
    await editLibrary(lib => { delete lib[id]; });
  }

  async function removeAll(filter) {
    const lib = await library();
    for (const id of Object.keys(lib)) if (!filter || filter(lib[id])) await del(id);
    await editLibrary(l => { for (const id of Object.keys(l)) if (!filter || filter(l[id])) delete l[id]; });
  }

  // Makes sure a font is available, downloading Google fonts on first use.
  async function ensure(id) {
    let rec = await get(id);
    if (!rec && id.startsWith('g:')) rec = await downloadGoogle(id.slice(2));
    return rec || null;
  }

  return { get, ensure, downloadGoogle, importFile, rename, remove, removeAll, library, parseFaces };
})();
