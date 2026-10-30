// Printer list saved on this device. Later the backend will keep these per shop.
import { DEFAULT_PRINTER, normalizePrinter, SHEET_ORDER } from '@engine';
import { store } from './storage.js';

export function allSheetIds(customSheets) {
  return [...SHEET_ORDER, ...customSheets.map((s) => s.id)];
}

export function loadPrinters(customSheets) {
  const saved = store.get('printers', null);
  const list = Array.isArray(saved) && saved.length ? saved : [DEFAULT_PRINTER];
  return list.map((p) => normalizePrinter(p, allSheetIds(customSheets)));
}

export function savePrinters(list) {
  store.set('printers', list);
}

// Margins in one short line: "5 mm" or "top 8 · right 4 · bottom 4 · left 4 mm"
export function marginText(m) {
  const f = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (m.top === m.right && m.top === m.bottom && m.top === m.left) return `${f(m.top)} mm margins`;
  return `margins top ${f(m.top)} · right ${f(m.right)} · bottom ${f(m.bottom)} · left ${f(m.left)} mm`;
}

// Sheet ids in display order (standard sizes first, then custom).
export function orderedSheets(ids, customSheets) {
  const order = allSheetIds(customSheets);
  return order.filter((id) => ids.includes(id));
}
