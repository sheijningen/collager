/* Typed settings on top of a Storage-like object (the renderer passes
 * window.localStorage; tests pass a fake). One place owns the `collager.`
 * key prefix and the boolean encoding ('1'/'0'). Loaded as a plain script
 * (window.CollagerPrefs) and require()-able from Node for unit tests. */
(function (exports) {
  'use strict';

  const PREFIX = 'collager.';

  function createPrefs(storage) {
    return {
      bool(key, def) {
        const v = storage.getItem(PREFIX + key);
        return v === null ? def : v === '1';
      },
      int(key, def, min, max) {
        const v = parseInt(storage.getItem(PREFIX + key), 10);
        if (!Number.isFinite(v)) return def;
        return Math.min(max, Math.max(min, v));
      },
      string(key, def) {
        const v = storage.getItem(PREFIX + key);
        return v === null ? def : v;
      },
      set(key, value) {
        const encoded = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
        storage.setItem(PREFIX + key, encoded);
      }
    };
  }

  exports.createPrefs = createPrefs;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.CollagerPrefs = {}));
