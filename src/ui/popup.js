(async () => {
  'use strict';
  const K = Alfaaz, api = K.api, { h, icon } = UI;
  const app = document.getElementById('app');
  await UI.load();
  const tab = await UI.activeTab().catch(() => null);
  const host = K.hostOf((tab && tab.url) || '');

  let shortcut = 'Alt+Shift+U';
  try { const cmds = await api.commands.getAll(); const c = cmds.find(x => x.name === 'toggle-site'); if (c) shortcut = c.shortcut || ''; } catch (e) { /* ignore */ }

  const openSettings = () => { api.runtime.openOptionsPage(); window.close(); };

  const bar = h('header', { class: 'bar' },
    h('span', { class: 'mark', 'aria-hidden': 'true' }, 'ف'), h('h1', null, 'Alfaaz'),
    h('button', { class: 'iconbtn', type: 'button', title: 'Settings and font library', 'aria-label': 'Settings and font library', onclick: openSettings }, icon('sliders')));

  // This site
  const sw = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Style text on this site' });
  const hostEl = h('span', { class: 'host' });
  const siteNote = h('span', { class: 'note muted' });
  const site = h('div', { class: 'site' }, h('div', { class: 'text' }, hostEl, siteNote), h('label', { class: 'switch' }, sw, h('span')));
  sw.addEventListener('change', () => UI.update(s => {
    s.disabledHosts = s.disabledHosts.filter(x => x !== host && !host.endsWith('.' + x));
    if (!sw.checked) s.disabledHosts.push(host);
  }, true));

  // Paused everywhere
  const paused = h('div', { class: 'banner', hidden: true },
    h('div', null, h('p', null, 'Alfaaz is paused on every site')),
    h('button', { class: 'btn primary small', type: 'button', onclick: () => UI.update(s => { s.enabled = true; }, true) }, 'Resume'));

  // Compare with the original text in this tab
  const compare = h('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', title: 'Alt+Shift+O' }, icon('columns'), 'Show original');
  const showCompare = on => {
    compare.setAttribute('aria-pressed', String(on));
    compare.lastChild.textContent = on ? 'Showing original' : 'Show original';
  };
  compare.addEventListener('click', async () => {
    try {
      const r = await api.tabs.sendMessage(tab.id, { t: 'pause' });
      showCompare(!!(r && r.paused));
    } catch (e) { compare.disabled = true; compare.title = 'Reload the page to use Alfaaz on it'; }
  });
  if (tab && host) api.tabs.sendMessage(tab.id, { t: 'status' }, { frameId: 0 }).then(r => showCompare(!!(r && r.paused)), () => {});
  const pauseAll = h('button', { class: 'btn quiet small', type: 'button', onclick: () => UI.update(s => { s.enabled = false; }, true) }, 'Pause everywhere');
  const foot = h('footer', { class: 'foot' }, compare, h('span', { class: 'spacer' }), pauseAll);

  const editor = UI.ProfileEditor({});
  app.append(bar, UI.accessBanner(), paused, site, editor, foot);
  app.removeAttribute('aria-busy');

  function render() {
    const s = UI.state.settings;
    paused.hidden = s.enabled;
    pauseAll.hidden = !s.enabled;
    if (!host) {
      hostEl.textContent = 'This page';
      siteNote.textContent = 'Browsers don’t let extensions change their own pages';
      sw.checked = false; sw.disabled = true; compare.disabled = true;
      return;
    }
    const off = K.siteOff(s, host);
    sw.checked = !off; sw.disabled = !s.enabled;
    hostEl.textContent = host === 'file' ? 'Local files' : host;
    siteNote.textContent = off ? 'Off on this site' : shortcut ? `On · ${shortcut} turns it off here` : 'On';
    compare.disabled = off || !s.enabled;
  }
  UI.onChange(render);
  render();
})();
