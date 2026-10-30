// The full plan for a Cut & Stack job.
// It reuses the Cards plan (size, fitting, bleed, printer, sheet layout) and adds
// the cut & stack order, numbering, books and copies.
//
// Two modes:
//   'number' : one design (page 1, optional back = page 2), each piece gets a number
//   'pages'  : every page of the file is a different piece, kept in page order

import { planCards } from '../cards/plan.js';
import { sheetsNeeded, stackRanges } from './order.js';
import {
  NUMBERING_DEFAULTS, resolveDigits, formatNumber, numberBoxMm, defaultPosition, secondPosition, clampPosition,
  copyNamePosition,
} from './numbering.js';

export function defaultMode(geometry) {
  return geometry.pageCount > 2 ? 'pages' : 'number';
}

export function planCutStack({ geometry, base, overrides = {}, customSheets = [], printer, inkTouches = false, numbering = {}, mode }) {
  const m = mode || defaultMode(geometry);
  const n = { ...NUMBERING_DEFAULTS, ...numbering };

  // In pages mode every page is a piece: the layout comes from page 1,
  // and Make bleed (which needs one design) is not used.
  const layoutGeometry = m === 'pages' ? { ...geometry, pageCount: 1, pages: geometry.pages.slice(0, 1) } : geometry;
  const cards = planCards({
    geometry: layoutGeometry,
    base: m === 'pages' ? { ...base, makeBleed: 'off' } : base,
    overrides,
    customSheets,
    printer,
    inkTouches,
  });

  const perSheet = cards.layout.count;
  const total = m === 'pages' ? geometry.pageCount : Math.max(1, Math.floor(n.count) || 1);
  const sheets = sheetsNeeded(total, perSheet);
  const parts = m === 'pages' ? 1 : Math.min(3, Math.max(1, Math.round(n.parts) || 1));
  const sidesPerSheet = cards.twoSided ? 2 : 1;

  // Numbers
  const digits = resolveDigits(n);
  const fmt = (i) => formatNumber(n.start + i, { prefix: n.prefix, suffix: n.suffix, digits });
  const sample = fmt(total - 1);
  const box = numberBoxMm(sample, n);
  const safe = cards.settings.safe;
  let positions = n.positions && n.positions.length ? n.positions : [defaultPosition(cards.out, box, safe)];
  positions = positions.map((p) => clampPosition(p, cards.out, box));

  const perBook = Math.max(0, Math.floor(n.perBook) || 0);

  // Copy names (ORIGINAL / DUPLICATE / TRIPLICATE) only make sense with 2 or 3 copies.
  const copyNames = m === 'number' && parts > 1 && !!n.copyNames;
  const names = NUMBERING_DEFAULTS.copyNameList.map((d, i) => String((n.copyNameList || [])[i] ?? d).trim().slice(0, 20));

  return {
    ...cards,
    tool: 'cutstack',
    stackMode: m, // 'number' or 'pages' (plan.mode is still Fill/Fit/Stretch)
    sourceGeometry: geometry,
    total,
    perSheet,
    sheets,
    parts,
    printOrder: n.printOrder === 'grouped' ? 'grouped' : 'sets',
    sidesPerSheet,
    pages: sheets * parts * sidesPerSheet,
    emptySpots: sheets * perSheet - total,
    stacks: stackRanges(total, perSheet),
    numbering: {
      ...n,
      digits,
      positions,
      box,
      first: fmt(0),
      last: sample,
      format: fmt,
      copyNames,
      copyNameList: names,
      copyNameAt: copyNamePosition(positions[0], box, cards.out),
    },
    books: perBook > 0 ? { perBook, count: Math.ceil(total / perBook), whole: total % perBook === 0 } : null,
  };
}

// Number positions for a new second number (ticket stub).
export function withSecondNumber(plan) {
  const { out, settings, numbering } = plan;
  return [...numbering.positions, secondPosition(out, numbering.box, settings.safe)];
}

// Which source page goes in a spot (pages mode), or the design page (number mode).
export function pageForItem(plan, item) {
  return plan.stackMode === 'pages' ? plan.sourceGeometry.pages[item] : plan.sides[0];
}
