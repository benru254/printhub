// Small settings saved on this device only (dismissed tips, custom sheets, last sheet).
// Later the backend will store these per user/printer.

const PREFIX = 'printhub.';

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Private mode or storage blocked: the app still works, it just won't remember.
    }
  },
};
