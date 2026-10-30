// Printer profiles: the real limits of each printer in the shop.
// Margins are measured with the margin test sheet (see testSheet.js).
//   flip 'book'     : the back side turns like a book page (left-right)
//   flip 'calendar' : the back side turns like a wall calendar (top-bottom)

export const MARGIN_LIMIT = 50; // mm

export const DEFAULT_PRINTER = {
  id: 'default',
  name: 'My printer',
  margins: { top: 5, right: 5, bottom: 5, left: 5 },
  measured: false,
  sheets: ['A4', 'A3', 'SRA3'],
  defaultSheet: 'A3',
  orientation: 'portrait',
  duplex: true,
  flip: 'book',
};

// Typical starting values only. Every printer is different: measure yours.
export const PRINTER_TEMPLATES = [
  {
    key: 'office-a4',
    label: 'Office printer (A4)',
    values: { name: 'Office A4 printer', margins: uniformMargins(4), sheets: ['A6', 'A5', 'A4', 'Letter'], defaultSheet: 'A4', duplex: true },
  },
  {
    key: 'a3-digital',
    label: 'A3 digital printer',
    values: { name: 'A3 digital printer', margins: uniformMargins(5), sheets: ['A5', 'A4', 'A3', 'SRA3'], defaultSheet: 'A3', duplex: true },
  },
  {
    key: 'sra3-press',
    label: 'SRA3 production press',
    values: { name: 'SRA3 press', margins: { top: 6, right: 4, bottom: 4, left: 4 }, sheets: ['A4', 'A3', 'SRA3'], defaultSheet: 'SRA3', duplex: true },
  },
  {
    key: 'large-format',
    label: 'Large format printer',
    values: { name: 'Large format printer', margins: uniformMargins(5), sheets: ['A3', 'A2'], defaultSheet: 'A2', duplex: false },
  },
];

export function uniformMargins(n) {
  return { top: n, right: n, bottom: n, left: n };
}

export function isUniform(m) {
  return m.top === m.right && m.top === m.bottom && m.top === m.left;
}

export function maxMargin(m) {
  return Math.max(m.top, m.right, m.bottom, m.left);
}

export function minMargin(m) {
  return Math.min(m.top, m.right, m.bottom, m.left);
}

// A number becomes the same margin on all sides; an object is checked.
export function toMargins(value) {
  if (typeof value === 'number') return uniformMargins(value);
  const v = value || {};
  const clean = (n) => Math.min(MARGIN_LIMIT, Math.max(0, Number(n) || 0));
  return { top: clean(v.top), right: clean(v.right), bottom: clean(v.bottom), left: clean(v.left) };
}

/**
 * Margins to use for a job. When printing both sides, the back is mirrored,
 * so the mirrored sides must use the bigger of the two margins.
 */
export function effectiveMargins(printer, { twoSided = false } = {}) {
  const m = toMargins(printer.margins);
  if (!twoSided) return m;
  if (printer.flip === 'calendar') {
    const tb = Math.max(m.top, m.bottom);
    return { ...m, top: tb, bottom: tb };
  }
  const lr = Math.max(m.left, m.right);
  return { ...m, left: lr, right: lr };
}

// Fixes up a printer so the rest of the app can trust it.
export function normalizePrinter(p, availableSheetIds = []) {
  const base = { ...DEFAULT_PRINTER, ...p };
  let sheets = (base.sheets || []).filter((id) => !availableSheetIds.length || availableSheetIds.includes(id));
  if (!sheets.length) sheets = availableSheetIds.length ? [availableSheetIds.includes('A3') ? 'A3' : availableSheetIds[0]] : ['A3'];
  return {
    ...base,
    name: String(base.name || 'Printer').trim().slice(0, 40) || 'Printer',
    margins: toMargins(base.margins),
    sheets,
    defaultSheet: sheets.includes(base.defaultSheet) ? base.defaultSheet : sheets[0],
    orientation: base.orientation === 'landscape' ? 'landscape' : 'portrait',
    duplex: base.duplex !== false,
    flip: base.flip === 'calendar' ? 'calendar' : 'book',
  };
}

// The name printers use in their print window for our flip, e.g. "Flip on long edge".
export function flipEdgeName(flip, sheetOrientation) {
  const longEdge = (flip === 'book') === (sheetOrientation !== 'landscape');
  return longEdge ? 'long edge' : 'short edge';
}
