// What this phone remembers about its customer: name and phone (to fill in forms),
// a token for "my orders", and the orders sent from here with the key of their tracking link.
// No password anywhere.
import { store } from './storage.js';

export const customer = {
  get: () => store.get('customer', { name: '', phone: '' }),
  set: (c) => store.set('customer', { name: String(c.name || '').trim(), phone: String(c.phone || '').trim() }),
  token: () => store.get('customerToken', null),
  forget() {
    store.set('customerToken', null);
    store.set('myOrders', []);
    store.set('customer', { name: '', phone: '' });
  },
};

export const knownOrders = () => store.get('myOrders', []);
export const keyFor = (code) => (knownOrders().find((o) => o.code === code) || {}).key || '';

// sent = what the server answered to a new order: { code, key, customerToken? }
export function rememberOrder(sent, title) {
  if (sent.customerToken) store.set('customerToken', sent.customerToken);
  const list = knownOrders().filter((o) => o.code !== sent.code);
  store.set('myOrders', [{ code: sent.code, key: sent.key || '', title, at: new Date().toISOString() }, ...list].slice(0, 30));
}

// Orders loaded from the server (my orders) also teach this phone their keys.
export function rememberKeys(orders) {
  const known = knownOrders();
  const merged = [...known];
  for (const o of orders) {
    const i = merged.findIndex((k) => k.code === o.code);
    if (i >= 0) merged[i] = { ...merged[i], key: o.key || merged[i].key };
    else merged.push({ code: o.code, key: o.key || '', title: o.title, at: o.createdAt });
  }
  store.set('myOrders', merged.slice(0, 60));
}

// The page a customer follows their order on. The key lets it open without typing the phone number.
export const trackHref = (code, key) => `#/track/${code}${key ? `?k=${encodeURIComponent(key)}` : ''}`;
export const trackUrl = (code, key) => `${window.location.origin}${window.location.pathname}${trackHref(code, key)}`;

// "?key=..." or "?phone=..." for the tracking addresses of the server.
export function accessQuery({ key, phone }) {
  return key ? `key=${encodeURIComponent(key)}` : `phone=${encodeURIComponent(phone || '')}`;
}
export const accessBody = ({ key, phone }) => (key ? { key } : { phone });
