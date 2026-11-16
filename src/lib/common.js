/* Alfaaz — shared constants and helpers.
 * Loaded by the content script, the background, the popup and the settings page. No DOM use at top level. */
var Alfaaz = (() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;

  // Arabic script blocks. ZWNJ/ZWJ ride along so they stay in the same font run as the letters around them.
  const UNICODE_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200D, U+FB50-FDFF, U+FE70-FEFF';
  const AR_TEST = /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const AR_LETTERS = /\p{Script=Arabic}/gu;
  const OTHER_LETTERS = /[^\p{Script=Arabic}\p{Script=Common}\p{Script=Inherited}]/gu;
  // Letters Urdu uses and Arabic / Persian don't: ٹ ڈ ڑ ں ھ ہ ۂ ۃ ے ۓ
  const URDU_MARKS = /[\u0679\u0688\u0691\u06BA\u06BE\u06C1-\u06C3\u06D2\u06D3]/;

  const LANGS = ['u', 'a'];
  const LANG_NAMES = { u: 'Urdu', a: 'Arabic & Persian' };
  const FAMILIES = { u: 'Alfaaz Urdu', a: 'Alfaaz Arabic' };

  const SAMPLES = {
    u: 'اردو ایک خوبصورت اور شیریں زبان ہے جس کی شاعری صدیوں سے دلوں کو چھوتی آئی ہے۔',
    a: 'اللغة العربية من أغنى لغات العالم، وخطّها فنّ قائم بذاته.',
    mix: 'یہ Chrome میں version 2.4 کا test ہے',
  };

  // Installed fonts often used for Arabic-script text. Matched through local().
  const LOCAL_FONTS = [
    ['Jameel Noori Nastaleeq', 'Nastaliq'], ['Jameel Noori Nastaleeq Kasheeda', 'Nastaliq'],
    ['Alvi Nastaleeq', 'Nastaliq'], ['Nafees Nastaleeq', 'Nastaliq'], ['Mehr Nastaliq Web', 'Nastaliq'],
    ['Pak Nastaleeq', 'Nastaliq'], ['Faiz Lahori Nastaleeq', 'Nastaliq'], ['Fajer Noori Nastalique', 'Nastaliq'],
    ['Noto Nastaliq Urdu', 'Nastaliq'], ['Gulzar', 'Nastaliq'], ['Urdu Typesetting', 'Naskh'],
    ['Nafees Web Naskh', 'Naskh'], ['Noto Naskh Arabic', 'Naskh'], ['Scheherazade New', 'Naskh'],
    ['Scheherazade', 'Naskh'], ['Lateef', 'Naskh'], ['Amiri', 'Naskh'], ['KFGQPC Uthmanic Script HAFS', 'Quranic'],
    ['Traditional Arabic', 'Naskh'], ['Simplified Arabic', 'Naskh'], ['Arabic Typesetting', 'Naskh'],
    ['Sakkal Majalla', 'Naskh'], ['DecoType Naskh', 'Naskh'], ['Noto Sans Arabic', 'Sans'], ['Vazirmatn', 'Sans'],
    ['Segoe UI', 'Sans'], ['Tahoma', 'Sans'], ['Arial', 'Sans'], ['Times New Roman', 'Serif'],
    ['Geeza Pro', 'Sans'], ['Al Bayan', 'Sans'], ['Baghdad', 'Naskh'], ['Damascus', 'Sans'], ['Farah', 'Display'],
    ['Nadeem', 'Naskh'], ['Mishafi', 'Display'], ['Andalus', 'Display'], ['DejaVu Sans', 'Sans'], ['FreeSerif', 'Serif'],
  ];

  // Free fonts that can be downloaded from Google Fonts.
  const GOOGLE_FONTS = [
    ['Noto Nastaliq Urdu', 'Nastaliq'], ['Gulzar', 'Nastaliq'],
    ['Noto Naskh Arabic', 'Naskh'], ['Amiri', 'Naskh'], ['Scheherazade New', 'Naskh'], ['Lateef', 'Naskh'],
    ['Markazi Text', 'Naskh'], ['Harmattan', 'Naskh'], ['Mirza', 'Naskh'], ['Amiri Quran', 'Quranic'],
    ['Noto Sans Arabic', 'Sans'], ['Vazirmatn', 'Sans'], ['IBM Plex Sans Arabic', 'Sans'], ['Readex Pro', 'Sans'],
    ['Alexandria', 'Sans'], ['Almarai', 'Sans'], ['Cairo', 'Sans'], ['Tajawal', 'Sans'], ['Mada', 'Sans'],
    ['Changa', 'Sans'], ['Baloo Bhaijaan 2', 'Rounded'], ['Noto Kufi Arabic', 'Kufi'], ['Reem Kufi', 'Kufi'],
    ['Kufam', 'Kufi'], ['Aref Ruqaa', 'Ruqaa'], ['El Messiri', 'Display'], ['Katibeh', 'Display'],
    ['Lemonada', 'Display'], ['Rakkas', 'Display'], ['Lalezar', 'Display'], ['Marhey', 'Display'], ['Jomhuria', 'Display'],
  ];

  const PROFILE_DEFAULTS = {
    u: { font: 'g:Noto Nastaliq Urdu', sizePct: 110, letterEm: 0, wordEm: 0.05, lineHeight: 2.2 },
    a: { font: 'g:Noto Naskh Arabic', sizePct: 105, letterEm: 0, wordEm: 0, lineHeight: 1.8 },
  };

  const DEFAULTS = {
    v: 2,
    enabled: true,
    disabledHosts: [],
    separateArabic: true,    // Arabic & Persian text gets its own profile
    alignRtl: true,          // right-align Urdu/Arabic paragraphs on left-to-right sites
    styleFields: true,       // text boxes and editors too
    threshold: 50,           // % of letters that must be Arabic script before spacing and line height apply
    profiles: PROFILE_DEFAULTS,
    customFonts: [],         // installed fonts added by name: { id: 'l:Name', name, names: [] }
    hidden: [],              // built-in font ids hidden from the pickers
  };

  const LIMITS = {
    sizePct: [50, 250], letterEm: [-0.1, 0.5], wordEm: [-0.2, 1], lineHeight: [1, 4], threshold: [5, 100],
  };

  const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const round = n => Math.round(n * 1000) / 1000;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  function sanitizeProfile(p, d) {
    p = p && typeof p === 'object' ? p : {};
    const lh = p.lineHeight === undefined ? d.lineHeight : Number(p.lineHeight);
    return {
      font: typeof p.font === 'string' ? str(p.font, 200) : d.font,
      sizePct: round(clamp(p.sizePct, ...LIMITS.sizePct, d.sizePct)),
      letterEm: round(clamp(p.letterEm, ...LIMITS.letterEm, d.letterEm)),
      wordEm: round(clamp(p.wordEm, ...LIMITS.wordEm, d.wordEm)),
      lineHeight: !Number.isFinite(lh) || lh <= 0 ? 0 : round(clamp(lh, ...LIMITS.lineHeight, 0)),
    };
  }

  function sanitize(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const prof = s.profiles && typeof s.profiles === 'object' ? s.profiles : {};
    const out = {
      v: 2,
      enabled: s.enabled !== false,
      disabledHosts: Array.isArray(s.disabledHosts)
        ? [...new Set(s.disabledHosts.filter(x => typeof x === 'string' && x).map(x => x.toLowerCase().slice(0, 253)))].slice(0, 1000)
        : [],
      separateArabic: s.separateArabic !== undefined ? !!s.separateArabic : DEFAULTS.separateArabic,
      alignRtl: s.alignRtl !== undefined ? !!s.alignRtl : DEFAULTS.alignRtl,
      styleFields: s.styleFields !== undefined ? !!s.styleFields : DEFAULTS.styleFields,
      threshold: Math.round(clamp(s.threshold, ...LIMITS.threshold, DEFAULTS.threshold)),
      profiles: { u: sanitizeProfile(prof.u, PROFILE_DEFAULTS.u), a: sanitizeProfile(prof.a, PROFILE_DEFAULTS.a) },
      customFonts: [],
      hidden: Array.isArray(s.hidden) ? [...new Set(s.hidden.filter(x => typeof x === 'string'))].slice(0, 500) : [],
    };
    const seen = new Set();
    for (const f of Array.isArray(s.customFonts) ? s.customFonts.slice(0, 200) : []) {
      const name = f && str(f.name, 120).trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.customFonts.push({
        id: 'l:' + name, name,
        names: Array.isArray(f.names) ? f.names.filter(n => typeof n === 'string' && n).slice(0, 8).map(n => n.slice(0, 160)) : [],
      });
    }
    return out;
  }

  /* Font ids
   *   ''          page font, nothing changes
   *   'l:<name>'  installed font, used through local()
   *   'g:<name>'  Google font, downloaded and kept by the extension
   *   'f:<id>'    font file the person added */
  const kindOf = id => (!id ? 'page' : id[1] === ':' ? { l: 'local', g: 'google', f: 'file' }[id[0]] || 'page' : 'page');
  const nameOf = id => (id && id[1] === ':' ? id.slice(2) : '');

  function nameVariants(name) {
    const n = name.trim(), c = n.replace(/\s+/g, '');
    return [...new Set([n, `${n} Regular`, `${n}-Regular`, `${c}-Regular`, c])];
  }

  function localNames(id, settings) {
    const name = nameOf(id);
    const c = settings && settings.customFonts.find(f => f.id === id);
    return [...new Set([...(c ? c.names : []), ...nameVariants(name)])];
  }

  const cssStr = s => String(s).replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const localSrc = names => names.map(n => `local("${cssStr(n)}")`).join(', ');

  function hostOf(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'file:') return 'file';
      return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : '';
    } catch (e) { return ''; }
  }

  const siteOff = (settings, host) => !!host && settings.disabledHosts.some(h => host === h || host.endsWith('.' + h));

  function toB64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromB64(s) {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function formatBytes(n) {
    if (!n) return '0 KB';
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  return {
    api, UNICODE_RANGE, AR_TEST, AR_LETTERS, OTHER_LETTERS, URDU_MARKS, LANGS, LANG_NAMES, FAMILIES, SAMPLES,
    LOCAL_FONTS, GOOGLE_FONTS, PROFILE_DEFAULTS, DEFAULTS, LIMITS,
    clamp, round, sanitize, sanitizeProfile, kindOf, nameOf, nameVariants, localNames, cssStr, localSrc,
    hostOf, siteOff, toB64, fromB64, formatBytes,
  };
})();
