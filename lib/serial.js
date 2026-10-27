// خوارزمية الرقم التسلسلي للمثلث — مشتركة بين الخادم ونسخة الهاتف
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MthSerial = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIC_SECRET = 'MTH-7f3a91c2-2026-ASL-K9x';
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  function serialFor(code, machine) {
    const m = String(machine).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const h = cyrb128(LIC_SECRET + '|' + String(code).toUpperCase() + '|' + m);
    return h.map(x => x.toString(16).padStart(8, '0')).join('').toUpperCase().slice(0, 20).match(/.{4}/g).join('-');
  }
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { cyrb128, serialFor, norm, ALPHA: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' };
});
