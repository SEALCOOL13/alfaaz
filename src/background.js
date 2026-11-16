/* Alfaaz — background.
 * Serves font bytes to pages, injects the user-level stylesheet that pages can't block or override,
 * runs keyboard shortcuts and keeps the toolbar badge honest. */
if (typeof importScripts === 'function' && typeof Alfaaz === 'undefined') importScripts('lib/common.js', 'lib/fontstore.js');

(() => {
  'use strict';
  const K = Alfaaz, api = K.api;
  const payloads = new Map(); // id → { updated, faces } as base64, small LRU

  async function fontPayload(id) {
    const lib = await FontStore.library();
    const meta = lib[id];
    const hit = payloads.get(id);
    if (hit && meta && hit.updated === meta.updated) {
      payloads.delete(id); payloads.set(id, hit);
      return hit;
    }
    const rec = await FontStore.ensure(id);
    if (!rec) throw new Error('This font is no longer in the library');
    const out = { updated: rec.updated, faces: rec.faces.map(f => ({ weight: f.weight, style: f.style, b64: K.toB64(f.data) })) };
    payloads.set(id, out);
    while (payloads.size > 6) payloads.delete(payloads.keys().next().value);
    return out;
  }

  async function swapCSS(sender, css, prev) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null || tabId < 0) return;
    const target = { tabId, frameIds: [sender.frameId || 0] };
    if (prev) { try { await api.scripting.removeCSS({ target, css: prev, origin: 'USER' }); } catch (e) { /* already gone */ } }
    if (css) await api.scripting.insertCSS({ target, css, origin: 'USER' });
  }

  async function settings() {
    const r = await api.storage.local.get('settings');
    return K.sanitize(r.settings);
  }

  // The page's top frame reports its state: '' (styled), 'off' (site or everything turned off), 'orig' (showing original).
  async function setBadge(tabId, text) {
    try {
      await api.action.setBadgeBackgroundColor({ tabId, color: '#3a3a3d' });
      if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ tabId, color: '#ededed' });
      await api.action.setBadgeText({ tabId, text });
    } catch (e) { /* tab closed */ }
  }

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;
    const reply = p => { p.then(v => sendResponse({ ok: true, ...v }), e => sendResponse({ ok: false, error: String((e && e.message) || e) })); return true; };
    switch (msg.t) {
      case 'hello': return reply(Promise.resolve({ host: K.hostOf((sender.tab && sender.tab.url) || '') }));
      case 'font': return reply(fontPayload(String(msg.id)));
      case 'download': return reply(FontStore.ensure(String(msg.id)).then(() => ({})));
      case 'css': return reply(swapCSS(sender, String(msg.css || ''), String(msg.prev || '')).then(() => ({})));
      case 'state':
        if (sender.tab && sender.frameId === 0) setBadge(sender.tab.id, ['off', 'orig'].includes(msg.text) ? msg.text : '');
        return false;
      default: return false;
    }
  });

  async function activeTab() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  api.commands.onCommand.addListener(async cmd => {
    const tab = await activeTab();
    if (!tab) return;
    if (cmd === 'toggle-site') {
      const host = K.hostOf(tab.url || '');
      if (!host) return;
      const s = await settings();
      const on = s.disabledHosts.includes(host);
      s.disabledHosts = on ? s.disabledHosts.filter(h => h !== host) : [...s.disabledHosts, host];
      await api.storage.local.set({ settings: s });
    } else if (cmd === 'compare') {
      try { await api.tabs.sendMessage(tab.id, { t: 'pause' }); } catch (e) { /* no content script here */ }
    }
  });

  // Content scripts only arrive in tabs loaded after install. Add them to the tabs that are already open.
  async function injectIntoOpenTabs() {
    let tabs = [];
    try { tabs = await api.tabs.query({}); } catch (e) { return; }
    for (const tab of tabs) {
      if (!/^(https?|file):/.test(tab.url || '')) continue;
      try {
        await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['lib/common.js', 'content.js'] });
      } catch (e) { /* restricted page */ }
    }
  }

  api.runtime.onInstalled.addListener(async ({ reason }) => {
    const r = await api.storage.local.get('settings');
    await api.storage.local.set({ settings: K.sanitize(r.settings) });
    injectIntoOpenTabs();
    if (reason === 'install') api.runtime.openOptionsPage();
  });
})();
