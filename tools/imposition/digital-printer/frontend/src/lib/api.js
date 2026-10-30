// Talks to the PrintHub server (/api, see server/). In development Vite passes /api on to port 5181.
import { store } from './storage.js';

const TOKEN_KEY = 'staffToken';

export const staffToken = {
  get: () => store.get(TOKEN_KEY, null),
  set: (t) => store.set(TOKEN_KEY, t),
  clear: () => store.set(TOKEN_KEY, null),
};

export async function api(path, { method = 'GET', json, form, auth = false } = {}) {
  const headers = {};
  if (auth && staffToken.get()) headers.authorization = `Bearer ${staffToken.get()}`;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body });
  } catch {
    throw new Error('Cannot reach the shop server. Check your internet, or that the server is running.');
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    const data = type.includes('json') ? await res.json().catch(() => ({})) : {};
    const err = new Error(data.error || (res.status === 404 ? 'The shop server is not running yet.' : `Server error (${res.status}).`));
    err.status = res.status;
    if (res.status === 401 && auth) staffToken.clear();
    throw err;
  }
  return type.includes('json') ? res.json() : res.blob();
}

// The tools that can be reopened from an order (recipe.tool).
export const ORDER_TOOLS = {
  cards: 'Cards, labels & stickers',
  cutstack: 'Numbered books & tickets',
  booklet: 'Booklet',
  perfectbound: 'Book (glued spine)',
};

export const STATUS_LABELS = {
  new: 'New',
  checking: 'Checking',
  needs_customer: 'Needs customer',
  approved: 'Approved',
  printing: 'Printing',
  ready: 'Ready',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

export function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
