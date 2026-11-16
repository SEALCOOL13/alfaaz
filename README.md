# Alfaaz — Urdu & Arabic text

Alfaaz (الفاظ, “words”) sets your font, size, letter spacing, word spacing and line height for Urdu, Arabic and Persian text on every website.
Works in Chrome, Edge, Brave, Opera, Vivaldi and Firefox (128 or newer).

## Install in Chrome, Edge or Brave

1. Unzip `alfaaz-2.0.0-chromium.zip` into a folder you will keep (for example `Documents/Alfaaz`). Don't delete this folder later, the browser loads Alfaaz from it.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top right in Chrome, left side in Edge).
4. Press **Load unpacked** and choose the folder from step 1 (the one that contains `manifest.json`).
5. Pin Alfaaz: press the puzzle-piece button in the toolbar, then the pin next to Alfaaz.

The settings page opens by itself the first time. Tabs that were already open start working right away.

To update later, replace the folder's contents with the new version and press the reload arrow on Alfaaz's card in `chrome://extensions`. Your settings and fonts are kept.

## Install in Firefox

Firefox only keeps extensions it has signed. Pick one:

**Try it now (removed when Firefox closes)**
1. Open `about:debugging#/runtime/this-firefox`.
2. Press **Load Temporary Add-on…** and choose `alfaaz-2.0.0-firefox.xpi`.

**Keep it permanently (free, about 5 minutes)**
1. Sign in at https://addons.mozilla.org/developers/ with a Firefox account.
2. Choose **Submit a New Add-on**, then **On your own** (this keeps it private, not listed in the store).
3. Upload `alfaaz-2.0.0-firefox.xpi`. Mozilla's robot checks and signs it, usually within minutes.
4. Download the signed file it gives you and drag it into a Firefox window, then press **Add**.

If Firefox shows a banner on the settings page asking for website access, press **Allow on all websites**.

## Using it

- **Toolbar button**: live preview, font, size and spacing, a switch for the current site, and **Show original** to compare.
- **Settings page** (the sliders icon in the popup): the full font library, mixed-language options, sites, shortcuts and backup.
- **Alt+Shift+U** turns Alfaaz off or on for the current site. **Alt+Shift+O** shows the original text in the current tab, press again to restyle.

### Fonts

- **Download all** fetches every free font in the library at once (about 30, a few MB in total). After that they work offline and on sites that block outside fonts.
- **Add installed font**: type the exact name of a font installed on your computer, such as Jameel Noori Nastaleeq. In Chrome, **Find installed fonts** lists every font on the computer to pick from.
- **Add from Google Fonts**: type any family name from fonts.google.com.
- **Add font files**: pick `.ttf`, `.otf`, `.woff` or `.woff2` files. Alfaaz keeps its own copy, so the font doesn't need to be installed.
- Every font can be removed, renamed (font files) or hidden from the lists.

### Urdu next to Arabic, English and other scripts

- The font only ever replaces Arabic-script letters. English words, numbers, emoji and other scripts in the same sentence keep the site's font.
- Urdu and Arabic/Persian get separate profiles. Urdu is recognised by letters only Urdu uses (ٹ ڈ ڑ ں ے and others), so a Quranic verse inside an Urdu article can be Naskh while the article is Nastaliq.
- Spacing and line height only apply to text that is mostly Urdu or Arabic (50% by default, adjustable), so an English paragraph with one Urdu word keeps its layout.
- On left-to-right sites, paragraphs and comments that are mostly Urdu or Arabic flow right to left with punctuation on the correct side. Centred text stays centred.

## Why it keeps working

- Styles are added by the browser as a user stylesheet. Pages can't block it with a Content Security Policy, can't remove it, and can't override it with `!important`.
- Fonts come from the extension's own storage through the browser's font API, so sites that block outside fonts can't stop them.
- Text is never rewritten or wrapped, only marked, so React, Vue and online editors keep working.
- New text that appears later (infinite scroll, comments, chat), text inside iframes and inside web components (open and closed shadow DOM) is handled too.

## Limits

- Browsers don't let extensions change their own pages (`chrome://`, the Chrome Web Store, `about:` pages, Firefox's built-in PDF viewer in some versions).
- Text drawn into images, canvas or video can't be changed.
- Size changes need a chosen font, because sizing works by scaling the font's Arabic letters.
- Letter spacing pulls joined Arabic letters apart. Word spacing and line height are the safer ways to open text up.

## Building from source

`python3 build.py` writes both packages to `dist/`. The Firefox build differs only in its manifest (background scripts instead of a service worker, and a Gecko id).

## Credits

Interface design guided by [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
Icons from [Lucide](https://lucide.dev), ISC licence. Fonts in the library are downloaded from Google Fonts under their own open licences.

## Tests

`tests/` loads the built Chromium extension into real Chrome with Puppeteer and checks it against a hostile test page (strict Content Security Policy, `!important` styles, mixed Urdu, Arabic and English, iframes, open and closed shadow DOM, text added later), the font library's Download all (with Google Fonts mocked), compare, site switching and the popup and settings pages.

```
python3 build.py
cd tests && npm install && CHROME=/path/to/chrome npm test
```
