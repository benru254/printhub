// Press sheet sizes in mm, stored portrait (w < h).
// Custom sheets are added by the user and passed in as a list.

import { fmtMm } from './units.js';

export const SHEETS = {
  A6: { id: 'A6', label: 'A6', w: 105, h: 148 },
  A5: { id: 'A5', label: 'A5', w: 148, h: 210 },
  A4: { id: 'A4', label: 'A4', w: 210, h: 297 },
  A3: { id: 'A3', label: 'A3', w: 297, h: 420 },
  SRA3: { id: 'SRA3', label: 'SRA3', w: 320, h: 450 },
  A2: { id: 'A2', label: 'A2', w: 420, h: 594 },
  Letter: { id: 'Letter', label: 'Letter', w: 215.9, h: 279.4 },
};

export const SHEET_ORDER = ['A6', 'A5', 'A4', 'A3', 'SRA3', 'A2', 'Letter'];

export const SHEET_LIMITS = { min: 20, max: 2000 };

export function getSheet(id, custom = []) {
  return SHEETS[id] || custom.find((s) => s.id === id) || SHEETS.A3;
}

export function sheetExists(id, custom = []) {
  return !!(SHEETS[id] || custom.find((s) => s.id === id));
}

// Returns the sheet turned to portrait or landscape.
export function orientSheet(sheet, orientation = 'portrait') {
  const short = Math.min(sheet.w, sheet.h);
  const long = Math.max(sheet.w, sheet.h);
  return orientation === 'landscape'
    ? { ...sheet, w: long, h: short, orientation: 'landscape' }
    : { ...sheet, w: short, h: long, orientation: 'portrait' };
}

// Validates and creates a custom sheet. Throws a friendly error if the size is wrong.
export function makeCustomSheet({ label, w, h }) {
  const W = Number(w);
  const H = Number(h);
  const { min, max } = SHEET_LIMITS;
  if (!(W >= min && W <= max && H >= min && H <= max)) {
    throw new Error(`Width and height must be between ${min} and ${max} mm.`);
  }
  const short = Math.min(W, H);
  const long = Math.max(W, H);
  const name = String(label || '').trim().slice(0, 14);
  return {
    id: `custom-${Date.now().toString(36)}`,
    label: name || `${fmtMm(short)}×${fmtMm(long)}`,
    w: short,
    h: long,
    custom: true,
  };
}
