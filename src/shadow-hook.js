/* Alfaaz — runs in the page's own world before page scripts.
 * Announces every shadow root the page creates (open or closed) so text inside web components gets styled too.
 * It only adds an event; the shadow root itself is untouched. */
(() => {
  'use strict';
  const proto = Element.prototype;
  const orig = proto.attachShadow;
  if (typeof orig !== 'function' || orig.__alfaaz) return;
  const native = Function.prototype.toString.call(orig);
  const wrapped = {
    attachShadow(init) {
      const root = orig.call(this, init);
      try { this.dispatchEvent(new Event('alfaaz:shadow')); } catch (e) { /* never break the page */ }
      return root;
    },
  }.attachShadow;
  Object.defineProperty(wrapped, '__alfaaz', { value: true });
  Object.defineProperty(wrapped, 'toString', { value: () => native, configurable: true, writable: true });
  Object.defineProperty(proto, 'attachShadow', { value: wrapped, configurable: true, writable: true, enumerable: false });
})();
