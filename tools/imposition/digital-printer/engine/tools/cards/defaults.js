// Where a Cards job starts: the printer's default sheet, then the user's saved
// default for this kind of product on this printer (e.g. business cards on the SRA3 press).

import { CARD_DEFAULTS } from './settings.js';

// Key used to save a product default: one per printer + product kind.
export const defaultKey = (printerId, kind) => `${printerId}|${kind}`;

/**
 * saved: the saved default for this printer + kind, or null:
 *   { sheet, orientation, marks, copies, overrides }
 * Returns { base, overrides } ready for planCards.
 */
export function cardStartState(printer, saved) {
  const base = {
    ...CARD_DEFAULTS,
    sheet: printer.defaultSheet,
    orientation: printer.orientation,
  };
  let overrides = {};
  if (saved) {
    if (printer.sheets.includes(saved.sheet)) {
      base.sheet = saved.sheet;
      base.orientation = saved.orientation === 'landscape' ? 'landscape' : 'portrait';
    }
    if (typeof saved.marks === 'boolean') base.marks = saved.marks;
    if (saved.copies > 0) base.copies = saved.copies;
    if (['auto', 'mirror', 'stretch', 'off'].includes(saved.makeBleed)) base.makeBleed = saved.makeBleed;
    if (['rect', 'rounded', 'ellipse'].includes(saved.shape)) base.shape = saved.shape;
    if (saved.radius >= 0) base.radius = saved.radius;
    if (['guillotine', 'plotter'].includes(saved.cutter)) base.cutter = saved.cutter;
    overrides = { ...(saved.overrides || {}) };
  }
  return { base, overrides };
}

// What gets saved when the user taps "Save as my default".
export function makeSavedDefault(base, overrides) {
  return {
    sheet: base.sheet,
    orientation: base.orientation,
    marks: base.marks,
    copies: base.copies,
    makeBleed: base.makeBleed,
    shape: base.shape,
    radius: base.radius,
    cutter: base.cutter,
    overrides: { ...overrides },
  };
}
