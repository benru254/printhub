// PERFECT-BOUND BOOK (glued spine).
// The inside pages are printed as SIGNATURES: groups of 4, 8, 16 or 32 pages.
// Each signature is folded like a small booklet; the signatures are stacked
// (not put inside each other) and glued at the spine. The cover is a separate
// wrap-around sheet: back cover | spine | front cover. Spine width = leaves x paper thickness.
//
// The plan has the same shape as a booklet plan, so the booklet PDF builder and
// previews work for the inside pages.

import { getSheet, orientSheet } from '../../core/sheets.js';
import { DEFAULT_PRINTER } from '../../core/printers.js';
import { round1 } from '../../core/units.js';
import { computeStepRepeat } from '../cards/layout.js';
import { resolveSettings, MAX_BLEED } from '../cards/settings.js';
import { saddleSheets } from '../booklet/order.js';
import { PAPERS, bestBookletSheet } from '../booklet/plan.js';

export const SIGNATURE_SIZES = [4, 8, 16, 32];

export const COVER_PAPERS = [
  { gsm: 200, label: '200 gsm', mm: 0.2 },
  { gsm: 250, label: '250 gsm', mm: 0.26 },
  { gsm: 300, label: '300 gsm', mm: 0.32 },
  { gsm: 350, label: '350 gsm', mm: 0.38 },
];

export const PERFECT_DEFAULTS = {
  copies: 20,
  signature: 16, // pages per signature
  coverFromFile: true, // first and last page of the file are the front and back cover
  paper: 80, // inside paper gsm
  coverPaper: 300,
  creep: 'auto',
  grind: 0, // mm milled off the spine edge of every page (adds space at the spine)
  spineText: '',
  shrink: 'auto',
};

export const MIN_SPINE_MM = 3; // thinner than this is hard to glue

// Splits n pages (multiple of 4) into signatures of `size` pages; the last may be smaller.
export function signatureSizes(n, size) {
  const list = [];
  let left = n;
  while (left > 0) {
    const k = Math.min(size, left);
    list.push(k);
    left -= k;
  }
  return list;
}

export function planPerfectBound({ geometry, base, overrides = {}, customSheets = [], printer = DEFAULT_PRINTER, book = {} }) {
  const b = { ...PERFECT_DEFAULTS, ...book };
  const pc = geometry.pageCount;
  const first = geometry.pages[0];
  const W = first.trimMm.w;
  const H = first.trimMm.h;

  // Cover pages come out of the file (front = first page, back = last page).
  const coverFromFile = !!b.coverFromFile && pc >= 3;
  const inside = [];
  for (let i = coverFromFile ? 1 : 0; i < (coverFromFile ? pc - 1 : pc); i++) inside.push(i);
  const n = Math.max(4, Math.ceil(inside.length / 4) * 4);
  const pad = n - inside.length;
  const order = [...inside, ...Array(pad).fill(null)];

  // Signatures
  const sigSize = SIGNATURE_SIZES.includes(Number(b.signature)) ? Number(b.signature) : 16;
  const sizes = signatureSizes(n, sigSize);
  const paper = PAPERS.find((p) => p.gsm === Number(b.paper)) || PAPERS[0];
  const grind = Math.max(0, Math.min(5, Number(b.grind) || 0));
  const sheetsInfo = [];
  let offset = 0;
  let creepTotal = 0;
  sizes.forEach((k, s) => {
    const local = saddleSheets(k);
    const count = local.length;
    let sigCreep = 0;
    if (b.creep === 'auto') sigCreep = count >= 3 ? paper.mm * (count - 1) : 0;
    else if (b.creep !== 'off') sigCreep = Math.max(0, Math.min(5, Number(b.creep) || 0));
    creepTotal = Math.max(creepTotal, sigCreep);
    local.forEach((sh, i) => {
      const creep = count > 1 ? (sigCreep * i) / (count - 1) : 0;
      sheetsInfo.push({
        front: sh.front.map((pos) => pos + offset),
        back: sh.back.map((pos) => pos + offset),
        signature: s,
        shift: creep - grind, // toward the fold for creep, away from it for the milled spine
      });
    });
    offset += k;
  });
  const sheetCount = sheetsInfo.length;

  // Layout of the inside sheets: one item = an open signature spread.
  const sourceBleed = Math.min(MAX_BLEED, ...geometry.pages.map((p) => p.bleedMm));
  const settings = resolveSettings(base, overrides, { availBleed: sourceBleed, printer, twoSided: true });
  const settingsFor = {
    margins: settings.margins,
    gap: settings.gap,
    bleed: settings.bleedUsed,
    marks: settings.marks,
    allowRotate: settings.allowRotate,
  };
  const spreadW = 2 * (W + grind);
  const sheet = orientSheet(getSheet(base.sheet, customSheets), base.orientation);
  const layoutAt = (sh, scale) => computeStepRepeat({ sheetW: sh.w, sheetH: sh.h, itemW: spreadW * scale, itemH: H * scale, ...settingsFor });
  const layoutFor = (sh) => layoutAt(sh, 1);

  let scale = 1;
  let layout = layoutAt(sheet, 1);
  if (!layout.count && b.shrink !== 'off' && layoutAt(sheet, 0.5).count) {
    let lo = 0.5;
    let hi = 1;
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2;
      if (layoutAt(sheet, mid).count) lo = mid;
      else hi = mid;
    }
    scale = Math.floor(lo * 1000) / 1000;
    layout = layoutAt(sheet, scale);
  }

  // Spine and cover
  const coverPaper = COVER_PAPERS.find((p) => p.gsm === Number(b.coverPaper)) || COVER_PAPERS[2];
  const spine = round1((n / 2) * paper.mm + 2 * coverPaper.mm * 0.5);
  let cover = { enabled: false };
  if (coverFromFile) {
    const cw = (2 * W + spine) * scale;
    const ch = H * scale;
    const coverSettings = { ...settingsFor, gap: Math.max(settingsFor.gap, 4) };
    // The cover sheet: the printer's sheet with the least paper that fits the whole cover.
    let best = null;
    for (const id of printer.sheets) {
      for (const orientation of ['landscape', 'portrait']) {
        const sh = orientSheet(getSheet(id, customSheets), orientation);
        const l = computeStepRepeat({ sheetW: sh.w, sheetH: sh.h, itemW: cw, itemH: ch, ...coverSettings });
        if (l.count && (!best || (sh.w * sh.h) / l.count < best.paper - 1)) best = { sheet: sh, layout: l, paper: (sh.w * sh.h) / l.count };
      }
    }
    cover = {
      enabled: true,
      w: cw,
      h: ch,
      spine: spine * scale,
      front: 0,
      back: pc - 1,
      paper: coverPaper,
      sheet: best ? best.sheet : null,
      layout: best ? best.layout : null,
      spineText: String(b.spineText || '').slice(0, 60),
    };
  }

  const perSheet = layout.count;
  const copies = Math.max(1, Math.floor(Number(b.copies)) || 1);
  const sets = perSheet ? Math.ceil(copies / perSheet) : 0;
  const coverSets = cover.enabled && cover.layout ? Math.ceil(copies / cover.layout.count) : 0;

  return {
    tool: 'perfectbound',
    geometry,
    page: { w: W, h: H },
    out: { w: W * scale, h: H * scale },
    spread: { w: spreadW * scale, h: H * scale },
    scale,
    order,
    pages: n,
    insidePages: inside.length,
    pad,
    blanks: 'end',
    signatures: sizes.map((k) => ({ pages: k, sheets: k / 4 })),
    signature: sigSize,
    sheetsInfo,
    sheetCount,
    shiftFor: (i) => sheetsInfo[i].shift,
    creepTotal,
    grind,
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
    spine,
    cover,
    coverSets,
    best: bestBookletSheet({ spreadW, spreadH: H, settingsFor, printer, customSheets }),
    mixedSizes: geometry.sizeGroups.length > 1,
  };
}
