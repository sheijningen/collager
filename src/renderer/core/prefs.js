/* Typed settings on top of a Storage-like object (the renderer passes
 * window.localStorage; tests pass a fake). One place owns the `collager.`
 * key prefix and the boolean encoding ('1'/'0'). */

const PREFIX = 'collager.';

export function createPrefs(storage) {
  return {
    bool(key, def) {
      const raw = storage.getItem(PREFIX + key);
      return raw === null ? def : raw === '1';
    },
    int(key, def, min, max) {
      const parsed = parseInt(storage.getItem(PREFIX + key), 10);
      if (!Number.isFinite(parsed)) return def;
      return Math.min(max, Math.max(min, parsed));
    },
    string(key, def) {
      const raw = storage.getItem(PREFIX + key);
      return raw === null ? def : raw;
    },
    set(key, value) {
      const encoded = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
      storage.setItem(PREFIX + key, encoded);
    }
  };
}
