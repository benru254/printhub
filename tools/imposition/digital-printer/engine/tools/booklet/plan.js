// The full plan for a saddle-stitch booklet.
// One "item" on the sheet is a SPREAD: two pages side by side (left + right).
// If more than one spread fits, each sheet prints several copies of the booklet.

import { getSheet, orientSheet } from '../../core/sheets.js';
import { DEFAULT_PRINTER } from '../../core/printers.js';
import { computeStepRepeat } from '../cards/layout.js';
import { resolveSettings, MAX_BLEED } from '../cards/settings.js';
import { bookletPages, saddleSheets } from './order.js';

// Paper weight -> thickness (mm). Typical values; coated paper is a little thinner.
export const PAPERS = [
  { gsm: 80, label: '80 gsm (office paper)', mm: 0.1 },
  { gsm: 100, label: '100 gsm', mm: 0.12 },
  { gsm: 130, label: '130 gsm (gloss/matt)', mm: 0.12 },
  { gsm: 150, label: '150 gsm', mm: 0.14 },
  { gsm: 170, label: '170 gsm', mm: 0.16 },
  { gsm: 200, label: '200 gsm', mm: 0.2 },
  { gsm: 250, label: '250 gsm (light card)', mm: 0.26 },
];

export const BOOKLET_DEFAULTS = {
  copies: 50, // booklets wanted
  blanks: 'before-back', // where blank pages go when pages are not a multiple of 4
  paper: 80, // gsm, for creep
  creep: 'auto', // 'auto' | 'off' | number (mm for the innermost sheet)
  shrink: 'auto', // 'auto' = shrink only when the spread doesn't fit | 'off'
};

export const MAX_STAPLED_PAGES = 64;

/**
 * Best sheet for a spread: the printer sheet (either direction) that fits at least one
 * spread at full size with the least paper per booklet.
 */
export function bestBookletSheet({ spreadW, spreadH, settingsFor, printer, customSheets }) {
  let best = null;
  for (const id of printer.sheets) {
    for (const orientation of ['portrait', 'landscape']) {
      const sheet = orientSheet(getSheet(id, customSheets), orientation);
      const l = computeStepRepeat({ sheetW: sheet.w, sheetH: sheet.h, itemW: spreadW, itemH: spreadH, ...settingsFor });
      if (!l.count) continue;
      const paper = (sheet.w * sheet.h) / l.count;
      if (!best || paper < best.paper - 1) best = { id, orientation, paper, count: l.count };
    }
  }
  return best;
}

export function planBooklet({ geometry, base, overrides = {}, customSheets = [], printer = DEFAULT_PRINTER, booklet = {} }) {
  const b = { ...BOOKLET_DEFAULTS, ...booklet };
  const first = geometry.pages[0];
  const W = first.trimMm.w;
  const H = first.trimMm.h;

  const order = bookletPages(geometry.pageCount, b.blanks);
  const n = order.length;
  const pad = n - geometry.pageCount;
  const sheetsInfo = saddleSheets(n);
  const sheetCount = sheetsInfo.length;

  // Bleed: what every page has (no Make bleed for booklets yet).
  const sourceBleed = Math.min(MAX_BLEED, ...geometry.pages.map((p) => p.bleedMm));
  const settings = resolveSettings(base, overrides, { availBleed: sourceBleed, printer, twoSided: true });
  const settingsFor = {
    margins: settings.margins,
    gap: settings.gap,
    bleed: settings.bleedUsed,
    marks: settings.marks,
    allowRotate: settings.allowRotate,
  };

  const sheet = orientSheet(getSheet(base.sheet, customSheets), base.orientation);
  const layoutAt = (sh, scale) =>
    computeStepRepeat({ sheetW: sh.w, sheetH: sh.h, itemW: 2 * W * scale, itemH: H * scale, ...settingsFor });
  const layoutFor = (sh) => layoutAt(sh, 1);

  // Shrink to fit (e.g. an A5 booklet on A4: most printers can't print to the edge).
  let scale = 1;
  let layout = layoutAt(sheet, 1);
  if (!layout.count && b.shrink !== 'off') {
    let lo = 0.5;
    let hi = 1;
    if (layoutAt(sheet, lo).count) {
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (layoutAt(sheet, mid).count) lo = mid;
        else hi = mid;
      }
      scale = Math.floor(lo * 1000) / 1000;
      layout = layoutAt(sheet, scale);
    }
  }

  // Creep: inner sheets stick out at the edge after folding. Their pages move toward the fold.
  const paper = PAPERS.find((p) => p.gsm === Number(b.paper)) || PAPERS[0];
  let creepTotal = 0;
  if (b.creep === 'auto') creepTotal = sheetCount >= 3 ? paper.mm * (sheetCount - 1) : 0;
  else if (b.creep !== 'off') creepTotal = Math.max(0, Math.min(5, Number(b.creep) || 0));
  creepTotal = Math.round(creepTotal * 100) / 100;
  const shiftFor = (i) => (sheetCount > 1 ? (creepTotal * i) / (sheetCount - 1) : 0);

  const perSheet = layout.count; // booklets printed by one set of sheets
  const copies = Math.max(1, Math.floor(Number(b.copies)) || 1);
  const sets = perSheet ? Math.ceil(copies / perSheet) : 0;

  return {
    tool: 'booklet',
    geometry,
    page: { w: W, h: H },
    out: { w: W * scale, h: H * scale },
    spread: { w: 2 * W * scale, h: H * scale },
    scale,
    order,
    pages: n,
    pad,
    blanks: b.blanks,
    sheetsInfo,
    sheetCount,
    shiftFor,
    creepTotal,
    paper,
    settings,
    sourceBleed,
    printer,
    flip: printer.flip || 'book',
    sheet,
    layout,
    layoutFor,
    perSheet,
    copies,
    sets,
    printedBooklets: sets * perSheet,
    pressSheets: sets * sheetCount,
    pdfPages: sheetCount * 2,
    best: bestBookletSheet({ spreadW: 2 * W, spreadH: H, settingsFor, printer, customSheets }),
    mixedSizes: geometry.sizeGroups.length > 1,
  };
}
