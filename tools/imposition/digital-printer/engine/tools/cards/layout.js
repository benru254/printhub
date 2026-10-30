// STEP & REPEAT: the same item repeated in a grid, as many as fit.
// All values in mm, origin = TOP-LEFT of the sheet (like a screen).
// margins: { top, right, bottom, left } that the printer cannot print on (a number = all sides).

import { toMargins, maxMargin } from '../../core/printers.js';

export const MARK_LENGTH = 4; // crop mark line length (mm)
export const MARK_MIN_OFFSET = 2; // gap between trim edge and the start of a mark (mm)

export function computeStepRepeat({ sheetW, sheetH, itemW, itemH, margins, margin, gap, bleed, marks, allowRotate }) {
  const m = toMargins(margins ?? margin ?? 0);
  const markOffset = Math.max(bleed, MARK_MIN_OFFSET);
  // Space needed around the whole grid: room for crop marks, or at least the bleed.
  const outer = marks ? markOffset + MARK_LENGTH : bleed;

  const availW = sheetW - m.left - m.right - 2 * outer;
  const availH = sheetH - m.top - m.bottom - 2 * outer;

  const options = [{ rotated: false, w: itemW, h: itemH }];
  if (allowRotate && Math.abs(itemW - itemH) > 0.01) options.push({ rotated: true, w: itemH, h: itemW });

  let best = null;
  for (const o of options) {
    const cols = fitCount(availW, o.w, gap);
    const rows = fitCount(availH, o.h, gap);
    const count = cols * rows;
    if (!best || count > best.count) best = { ...o, cols, rows, count };
  }

  const base = {
    sheetW, sheetH, margins: m, margin: maxMargin(m), gap, bleed, marks,
    markOffset, markLength: MARK_LENGTH, outer, itemW, itemH,
  };

  if (best.count === 0) {
    return { ...base, count: 0, cols: 0, rows: 0, rotated: false, slots: [], grid: null, effBleed: 0, bleedClipped: false, wastePct: 100 };
  }

  const { cols, rows, w, h, rotated, count } = best;
  const gridW = cols * w + (cols - 1) * gap;
  const gridH = rows * h + (rows - 1) * gap;
  // Centre the grid inside the printable area.
  const x0 = m.left + outer + (availW - gridW) / 2;
  const y0 = m.top + outer + (availH - gridH) / 2;

  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: x0 + c * (w + gap), y: y0 + r * (h + gap), w, h, rotated });
    }
  }

  // If the gap is narrower than two bleeds, neighbouring bleeds would overlap. Trim them to fit.
  const effBleed = Math.min(bleed, gap / 2);
  const usedArea = count * itemW * itemH;

  return {
    ...base,
    count,
    cols,
    rows,
    rotated,
    slots,
    grid: { x: x0, y: y0, w: gridW, h: gridH },
    effBleed,
    bleedClipped: effBleed < bleed,
    wastePct: Math.round(100 * (1 - usedArea / (sheetW * sheetH))),
  };
}

// How many items of `size` fit in `length` with `gap` between them.
export function fitCount(length, size, gap) {
  if (size <= 0 || length < size) return 0;
  return Math.floor((length + gap) / (size + gap) + 1e-9);
}
