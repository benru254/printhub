// Numbering for receipt books, tickets and invoices.

import { cmyk } from 'pdf-lib';

export const NUMBER_COLORS = {
  red: { label: 'Red', pdf: cmyk(0, 1, 1, 0), css: '#e3262f' },
  black: { label: 'Black', pdf: cmyk(0, 0, 0, 1), css: '#111111' },
  blue: { label: 'Blue', pdf: cmyk(1, 0.7, 0, 0), css: '#1d4fb8' },
};

// 'bold' = clean modern numbers, 'machine' = the classic numbering-machine look.
export const NUMBER_FONTS = {
  bold: { label: 'Bold', pdf: 'Helvetica-Bold', css: '700 {size}px Arial, Helvetica, sans-serif', charEm: 0.556 },
  machine: { label: 'Machine', pdf: 'Courier-Bold', css: '700 {size}px "Courier New", Courier, monospace', charEm: 0.6 },
};

export const NUMBERING_DEFAULTS = {
  start: 1,
  count: 100,
  digits: 'auto', // 'auto' or a number of digits (0001 = 4)
  prefix: 'No. ',
  suffix: '',
  color: 'red',
  font: 'bold',
  size: 12, // points
  positions: null, // null = smart default (top right). [{ x, y }] centre in mm on the finished piece
  parts: 1, // 1 = single, 2 = duplicate, 3 = triplicate (NCR paper)
  perBook: 50, // leaves per book, 0 = not books
  printOrder: 'sets', // 'sets' (copy 1, copy 2, copy 1, copy 2...) or 'grouped' (all copy 1, then all copy 2)
  copyNames: true, // print the copy's name (ORIGINAL / DUPLICATE...) next to the number (only with 2-3 copies)
  copyNameList: ['ORIGINAL', 'DUPLICATE', 'TRIPLICATE'],
};

export const COPY_NAME_SIZE = 6.5; // points

export const PART_NAMES = ['white', 'pink', 'yellow'];

export function resolveDigits(numbering) {
  const last = numbering.start + Math.max(1, numbering.count) - 1;
  if (numbering.digits === 'auto' || !numbering.digits) return Math.max(4, String(last).length);
  return Math.max(1, Math.min(10, Math.round(numbering.digits)));
}

export function formatNumber(n, { prefix = '', suffix = '', digits = 4 }) {
  return `${prefix}${String(n).padStart(digits, '0')}${suffix}`;
}

// Rough size of the number text in mm (the PDF uses exact font sizes).
export function numberBoxMm(text, { size, font }) {
  const em = (NUMBER_FONTS[font] || NUMBER_FONTS.bold).charEm;
  const pt = size;
  return { w: (text.length * em * pt * 25.4) / 72, h: (pt * 0.7 * 25.4) / 72 };
}

// Smart default position: top right, just inside the safe zone.
export function defaultPosition(out, box, safe) {
  const inset = Math.max(safe, 3) + 1;
  return { x: Math.max(box.w / 2, out.w - inset - box.w / 2), y: Math.min(out.h - box.h / 2, inset + box.h / 2) };
}

// A second number, e.g. for a ticket stub: bottom left.
export function secondPosition(out, box, safe) {
  const inset = Math.max(safe, 3) + 1;
  return { x: Math.min(out.w - box.w / 2, inset + box.w / 2), y: Math.max(box.h / 2, out.h - inset - box.h / 2) };
}

/**
 * Where the copy name goes: centred just under the first number,
 * or just above it when there is no room under it.
 */
export function copyNamePosition(numberPos, numberBox, out) {
  const h = (COPY_NAME_SIZE * 0.7 * 25.4) / 72;
  const below = numberPos.y + numberBox.h / 2 + 1.2 + h / 2;
  const y = below + h / 2 <= out.h - 1 ? below : numberPos.y - numberBox.h / 2 - 1.2 - h / 2;
  return { x: numberPos.x, y };
}

export function clampPosition(pos, out, box) {
  return {
    x: Math.min(out.w - box.w / 2, Math.max(box.w / 2, pos.x)),
    y: Math.min(out.h - box.h / 2, Math.max(box.h / 2, pos.y)),
  };
}
