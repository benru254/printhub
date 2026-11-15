// PRODUCT PRICES. Turns "500 business cards, both sides, matt lamination" into a price.
// Used by the phone (to show the price before sending) and by the server (to charge),
// so they always agree. No screen code and no PDF code in here.
//
// How it decides:
//   1. Work out how the job is made: how many pieces fit on the shop's sheet, how many sheets.
//   2. Price it on the digital printer from the price list.
//   3. Big quantity and the product allows it: price it on the offset press too and keep the
//      cheaper one ("route"). The customer just sees the lower price and the later date.
//   4. A product with its own price table (100 = 500, 500 = 1,500...) uses the table for the
//      standard options; other options add or remove what they cost.
//   5. Add the extras: design help, express, delivery.

import { computeStepRepeat } from '../tools/cards/layout.js';
import { eyeletCount } from '../tools/largeformat/finish.js';
import { DEFAULT_PRINTER, effectiveMargins, normalizePrinter } from './printers.js';
import { getSheet, orientSheet } from './sheets.js';
import { quotePrice, fullPriceList, findPaper, findMaterial, roundUp, num, money, A3_AREA } from './pricing.js';
import { cleanChoice, defaultChoice, choiceText, choiceSizeName, sizeText } from './catalogue.js';

export const STANDARD_BLEED_MM = 3;
export const MAX_STAPLED = 64;

// Everything pricing needs to know about the shop, in one object.
export function pricingContext({ priceList, printers = [], customSheets = [] } = {}) {
  const printer = printers && printers.length ? printers[0] : DEFAULT_PRINTER;
  return { priceList: fullPriceList(priceList), printer: normalizePrinter(printer), customSheets: customSheets || [] };
}

// How many w × h pieces a shop gets out of one sheet, for PRICING.
// Shops quote the economical way: 4 A5 flyers from an A3 sheet, 21 business cards.
// So the best of three layouts counts: with bleed and cut marks, edge to edge inside the
// printer margins, and edge to edge on the whole sheet (the operator prints those with a
// thin white edge or a slightly smaller design). The operator's tool then makes the real layout.
export function piecesPerSheet({ w, h, sheetW, sheetH, margins }) {
  const b = STANDARD_BLEED_MM;
  const grid = (m, gap, bleed, marks) => computeStepRepeat({ sheetW, sheetH, itemW: w, itemH: h, margins: m, gap, bleed, marks, allowRotate: true }).count;
  const withBleed = grid(margins, b * 2, b, true);
  const tight = grid(margins, 0, 0, false);
  const whole = grid(0, 0, 0, false);
  const count = Math.max(withBleed, tight, whole);
  return { count, bleed: count > 0 && count === withBleed, fullSheet: count === 1 && withBleed === 0 && tight === 0 };
}

// The shop's sheet for a piece: the printer's usual sheet, or a bigger one when it does not fit.
export function sheetForPiece({ w, h }, ctx, twoSided = false) {
  const { printer, customSheets } = ctx;
  const margins = effectiveMargins(printer, { twoSided });
  const area = (id) => {
    const s = getSheet(id, customSheets);
    return s.w * s.h;
  };
  const ids = [printer.defaultSheet, ...printer.sheets.filter((id) => id !== printer.defaultSheet).sort((a, b) => area(b) - area(a))];
  for (const id of ids) {
    const sheet = orientSheet(getSheet(id, customSheets), printer.orientation);
    const fit = piecesPerSheet({ w, h, sheetW: sheet.w, sheetH: sheet.h, margins });
    if (fit.count) return { sheet, ...fit };
  }
  return null;
}

// ---------- how each kind of product is made (digital) ----------

function sheetJob(product, c, ctx) {
  const fit = sheetForPiece(c, ctx, c.sides === 2);
  if (!fit) return null;
  const sheets = Math.ceil(c.quantity / fit.count);
  return {
    ups: fit.count, sheets, sheet: fit.sheet,
    spec: {
      groups: [{ label: 'Printing', sheets, sheetW: fit.sheet.w, sheetH: fit.sheet.h, sides: c.sides, sticker: !!product.sticker }],
      cut: fit.fullSheet ? 'none' : product.cut || 'guillotine',
    },
  };
}

function bookletJob(product, c, ctx) {
  const glued = product.binding === 'glue' || c.pages > MAX_STAPLED;
  // Stapled: the cover is the outside 4 pages of the file. Glued: the cover wraps around the pages.
  const inside = glued || !c.cover ? c.pages : c.pages - 4;
  const piece = glued ? { w: c.w, h: c.h } : { w: 2 * c.w, h: c.h }; // glued = single leaves, stapled = spreads
  const fit = sheetForPiece(piece, ctx, true);
  if (!fit) return null;
  const perCopy = Math.ceil(inside / (glued ? 2 : 4));
  const sheets = Math.ceil((c.quantity * perCopy) / fit.count);
  const groups = [];
  if (sheets) groups.push({ label: 'Inside pages', sheets, sheetW: fit.sheet.w, sheetH: fit.sheet.h, sides: 2, paper: c.paper, noLaminate: true });
  if (c.cover) {
    const spine = glued ? Math.ceil(c.pages / 2) * 0.1 : 0;
    const coverFit = sheetForPiece({ w: 2 * c.w + spine, h: c.h }, ctx, !glued) || { sheet: fit.sheet, count: 1 };
    groups.push({
      label: 'Cover', sheets: Math.ceil(c.quantity / coverFit.count), sheetW: coverFit.sheet.w, sheetH: coverFit.sheet.h,
      sides: glued ? 1 : 2, paper: product.coverPaper || 'card250',
    });
  }
  return { ups: fit.count, sheets, sheet: fit.sheet, glued, spec: { groups, cut: 'guillotine', books: c.quantity, binding: glued ? 'glue' : 'staple' } };
}

function padJob(product, c, ctx) {
  const fit = sheetForPiece(c, ctx, false);
  if (!fit) return null;
  const leaves = c.quantity * c.sets * c.parts;
  const sheets = Math.ceil(leaves / fit.count);
  return {
    ups: fit.count, sheets, sheet: fit.sheet, leaves,
    spec: { groups: [{ label: 'Printing', sheets, sheetW: fit.sheet.w, sheetH: fit.sheet.h, sides: 1, paper: c.paper }], cut: 'guillotine', books: c.quantity, binding: 'pad' },
  };
}

const JOBS = { sheet: sheetJob, booklet: bookletJob, pad: padJob };

// ---------- offset press ----------

// The same flat job on the offset press, or null when offset cannot or should not take it.
export function offsetQuote(product, c, priceList) {
  const o = priceList.offset || {};
  if (!o.enabled || !product.offset || product.kind !== 'sheet' || c.quantity < num(o.minQuantity, 1)) return null;
  const margins = { top: num(o.margin), right: num(o.margin), bottom: num(o.gripper), left: num(o.margin) };
  const fit = piecesPerSheet({ w: c.w, h: c.h, sheetW: o.sheetW, sheetH: o.sheetH, margins });
  if (!fit.count) return null;
  const twoSided = c.sides === 2;
  const colours = c.colour ? 4 : 1;
  // Work and turn: front and back share one set of plates; the sheet is turned over and
  // printed again. Needs an even number of pieces on the sheet.
  const turn = twoSided && fit.count % 2 === 0;
  const formes = twoSided && !turn ? 2 : 1;
  const plates = colours * formes;
  const good = Math.ceil(c.quantity / fit.count);
  const sheets = good + Math.round(num(o.wasteSheets)) + Math.ceil((good * num(o.wastePct)) / 100);
  const passes = twoSided ? 2 : 1;
  const area = (o.sheetW * o.sheetH) / A3_AREA;
  const paper = findPaper(priceList, { id: c.paper, sticker: !!product.sticker });
  const lines = [
    { label: 'Plates', detail: `${plates} ${plates === 1 ? 'plate' : 'plates'}${turn ? ' · work and turn' : ''}`, amount: money(plates * num(o.plate)) },
    { label: 'Press setup', detail: `${formes} ${formes === 1 ? 'side' : 'sides'}`, amount: money(formes * num(o.setup)) },
    { label: 'Printing', detail: `${sheets} press sheets · ${fit.count} per sheet${twoSided ? ' · both sides' : ''}`, amount: money(num(o.runPer1000) * Math.max(1, (sheets * passes) / 1000)) },
    { label: paper.name, detail: `${sheets} sheets of ${o.sheetW} × ${o.sheetH} mm`, amount: money(((num(paper.priceA3) * area * num(o.paperPct, 100)) / 100) * sheets) },
  ];
  if (c.laminate && c.laminate !== 'none') {
    const sides = twoSided ? 2 : 1;
    lines.push({ label: `${c.laminate === 'matt' ? 'Matt' : 'Gloss'} lamination`, detail: `${good * sides} sides`, amount: money(num(priceList.laminate[c.laminate]) * area * sides * good) });
  }
  if (product.cut !== 'none') {
    lines.push({ label: 'Cutting', detail: 'cut to size', amount: money(num(priceList.cutting.perJob) + num(priceList.cutting.perSheet) * good) });
  }
  return { lines, net: money(lines.reduce((a, l) => a + l.amount, 0)), ups: fit.count, sheets, good, turn, plates };
}

// ---------- large format ----------

function areaQuote(product, c, priceList) {
  const lf = priceList.largeFormat;
  const m = findMaterial(priceList, c.material);
  if (!m) return null;
  const each = Math.max(num(lf.minSqm), (c.w / 1000) * (c.h / 1000));
  const sqm = money(each * c.quantity);
  const lines = [{ label: m.name, detail: `${c.quantity} × ${sizeText(c.w, c.h)} = ${sqm} m²`, amount: money(num(m.pricePerSqm) * sqm) }];
  const f = c.finish || {};
  if (f.hem) {
    const metres = money(((2 * (c.w + c.h)) / 1000) * c.quantity);
    lines.push({ label: 'Hemmed edges', detail: `${metres} m`, amount: money(metres * num(lf.hem)) });
  }
  let eyelets = 0;
  if (f.eyelets) {
    eyelets = eyeletCount(c.w, c.h) * c.quantity;
    lines.push({ label: 'Eyelets', detail: `${eyelets} rings`, amount: money(eyelets * num(lf.eyelet)) });
  }
  if (f.pockets) {
    const metres = money(((2 * c.w) / 1000) * c.quantity);
    lines.push({ label: 'Pole pockets', detail: `${metres} m`, amount: money(metres * num(lf.pocket)) });
  }
  if (f.laminate) lines.push({ label: 'Lamination', detail: `${sqm} m²`, amount: money(sqm * num(lf.laminate)) });
  if ((product.includes || []).includes('rollupStand')) {
    lines.push({ label: 'Stand and bag', detail: `${c.quantity}`, amount: money(c.quantity * num(lf.rollupStand)) });
  }
  return { lines, net: money(lines.reduce((a, l) => a + l.amount, 0)), sqm, eyelets, material: m };
}

// ---------- price tables ----------

// The shop's fixed price for a quantity: exact when listed, a straight line between two
// listed quantities, the smallest price below the list, the last "each" price above it.
export function tablePrice(table, quantity) {
  const rows = (table || []).filter((r) => r.qty > 0 && r.price > 0).sort((a, b) => a.qty - b.qty);
  if (!rows.length) return null;
  const exact = rows.find((r) => r.qty === quantity);
  if (exact) return exact.price;
  if (quantity < rows[0].qty) return rows[0].price;
  const last = rows[rows.length - 1];
  if (quantity > last.qty) return money((last.price / last.qty) * quantity);
  const hi = rows.findIndex((r) => r.qty > quantity);
  const a = rows[hi - 1];
  const b = rows[hi];
  return money(a.price + ((b.price - a.price) * (quantity - a.qty)) / (b.qty - a.qty));
}

// ---------- the price ----------

// What making it costs before extras: { lines, net, route, ... } or null when it cannot be made.
function production(product, c, ctx) {
  const pl = ctx.priceList;
  if (product.kind === 'area') {
    const a = areaQuote(product, c, pl);
    return a ? { ...a, route: 'large', discount: 0, discountPct: 0 } : null;
  }
  const job = JOBS[product.kind](product, c, ctx);
  if (!job) return null;
  const q = quotePrice(job.spec, { paper: c.paper, colour: c.colour, laminate: c.laminate }, pl);
  const digital = { ...job, lines: q.lines, net: money(q.subtotal - q.discount), discount: q.discount, discountPct: q.discountPct, route: 'digital' };
  const press = offsetQuote(product, c, pl);
  if (press && press.net < digital.net) {
    return { ...press, route: 'offset', discount: 0, discountPct: 0, sheet: { label: `${pl.offset.sheetW} × ${pl.offset.sheetH} mm`, w: pl.offset.sheetW, h: pl.offset.sheetH }, spec: job.spec };
  }
  return digital;
}

/**
 * product: from the catalogue.   rawChoice: what the customer picked (cleaned here).
 * ctx: pricingContext(...)       extras: { artwork: 'upload' | 'design' | 'later', speed: 'standard' | 'express', delivery: 'collect' | 'deliver' }
 * Returns the full quote. total = 0 with onRequest = true means "the shop will tell you the price".
 */
export function priceProduct(product, rawChoice, ctx, extras = {}) {
  const pl = ctx.priceList;
  const c = cleanChoice(product, rawChoice);
  const base = { currency: pl.currency || 'KES', choice: c, quantity: c.quantity, example: !!pl.example, productId: product.id };
  const made = production(product, c, ctx);
  if (!made) {
    return { ...base, onRequest: true, lines: [], production: 0, total: 0, each: 0, route: null, days: num(product.days, 2), express: { offered: false }, extras: [] };
  }

  let { lines, net } = made;
  let discount = made.discount;
  let discountPct = made.discountPct;
  let fromTable = false;
  const fixed = tablePrice(product.priceTable, c.quantity);
  if (fixed != null) {
    // The table is the price for the standard options. Other options add or remove what they cost.
    const std = production(product, defaultChoice(product, c.quantity), ctx);
    const delta = std ? money(net - std.net) : 0;
    net = Math.max(0, money(fixed + delta));
    lines = [{ label: product.name, detail: `${c.quantity} ${product.unit}`, amount: fixed }];
    if (Math.abs(delta) >= 0.01) lines.push({ label: 'Your options', detail: choiceText(product, c, pl), amount: delta });
    discount = 0;
    discountPct = 0;
    fromTable = true;
  }

  let productionTotal = roundUp(net, pl);
  const minimum = num(pl.minOrder);
  const atMinimum = productionTotal < minimum;
  if (atMinimum) productionTotal = minimum;

  // How long it takes, and whether express is on offer.
  const days = num(product.days, 2) + (made.route === 'offset' ? num(pl.offset.extraDays) : 0);
  const rush = pl.rush || {};
  const express = { offered: !!rush.enabled && made.route !== 'offset' && num(rush.days) < days, days: num(rush.days), pct: num(rush.pct) };
  express.amount = express.offered ? roundUp((productionTotal * express.pct) / 100, pl) : 0;

  const extraLines = [];
  if (extras.artwork === 'design') {
    const fee = product.designFee !== undefined ? num(product.designFee) : num(pl.design && pl.design.fee);
    if (fee > 0) extraLines.push({ key: 'design', label: 'Design', detail: 'the shop makes your design', amount: money(fee) });
  }
  const isExpress = extras.speed === 'express' && express.offered;
  if (isExpress && express.amount > 0) extraLines.push({ key: 'express', label: 'Express', detail: `+${express.pct}%`, amount: express.amount });
  if (extras.delivery === 'deliver' && pl.delivery && pl.delivery.enabled) {
    extraLines.push({ key: 'delivery', label: 'Delivery', detail: pl.delivery.note || '', amount: money(num(pl.delivery.fee)) });
  }
  const total = roundUp(productionTotal + extraLines.reduce((a, l) => a + l.amount, 0), pl);

  return {
    ...base,
    route: made.route, // 'digital' | 'offset' | 'large'
    lines, discount, discountPct, atMinimum, fromTable,
    production: productionTotal,
    extras: extraLines,
    total,
    each: money(productionTotal / c.quantity),
    days: isExpress ? express.days : days,
    standardDays: days,
    express,
    speed: isExpress ? 'express' : 'standard',
    sheets: made.sheets || 0,
    ups: made.ups || 0,
    sheetLabel: made.sheet ? made.sheet.label : null,
    spec: made.spec || null,
    ...(made.route === 'offset' ? { offset: { plates: made.plates, turn: made.turn, good: made.good } } : {}),
    ...(made.route === 'large' ? { sqm: made.sqm, eyelets: made.eyelets } : {}),
  };
}

// The price at each of the product's usual quantities, for the quantity buttons:
// [{ quantity, total, each, route, days, saves }]. saves = % cheaper per piece than the first one.
export function priceLadder(product, rawChoice, ctx, extras = {}) {
  const rows = (product.quantities || []).map((quantity) => {
    const q = priceProduct(product, { ...rawChoice, quantity }, ctx, { ...extras, artwork: 'upload', delivery: 'collect', speed: 'standard' });
    return { quantity, total: q.production, each: q.each, route: q.route, days: q.days, onRequest: !!q.onRequest };
  });
  const first = rows.find((r) => r.each > 0);
  return rows.map((r) => ({ ...r, saves: first && r.each > 0 && r.each < first.each ? Math.round(100 * (1 - r.each / first.each)) : 0 }));
}

// "from KSh 540" on the product list.
export function fromPrice(product, ctx) {
  const rows = priceLadder(product, {}, ctx).filter((r) => r.total > 0);
  return rows.length ? Math.min(...rows.map((r) => r.total)) : 0;
}

// The deposit the shop asks for before printing (rounded up like every price).
export function depositFor(total, depositPct, priceList) {
  const pct = Math.min(100, Math.max(0, num(depositPct)));
  if (!pct || !(total > 0)) return 0;
  return Math.min(total, roundUp((total * pct) / 100, priceList));
}

// ---------- what the operator gets ----------

// The settings the operator's tool starts from, so the job opens the way the customer ordered it.
export function productRecipe(product, choice, quote) {
  const c = choice;
  const common = { v: 1, product: { id: product.id, name: product.name, choice: c }, options: { paper: c.paper || null, colour: c.colour !== false, laminate: c.laminate || 'none' } };
  if (product.kind === 'area') {
    return { ...common, tool: 'largeformat', base: { w: c.w, h: c.h, material: c.material, finish: c.finish || {}, copies: c.quantity } };
  }
  const size = { w: c.w, h: c.h };
  if (product.kind === 'booklet') {
    const glued = product.binding === 'glue' || c.pages > MAX_STAPLED;
    return glued
      ? { ...common, tool: 'perfectbound', base: { size, fitMode: 'fill' }, extra: { book: { copies: c.quantity } } }
      : { ...common, tool: 'booklet', base: { size, fitMode: 'fill' }, extra: { booklet: { copies: c.quantity } } };
  }
  if (product.kind === 'pad') {
    return {
      ...common, tool: 'cutstack', base: { size, fitMode: 'fill', copies: c.quantity * c.sets },
      extra: { mode: 'number', numbering: { start: c.numberFrom, count: c.quantity * c.sets, parts: c.parts, perBook: c.sets } },
    };
  }
  const plotter = product.cut === 'contour';
  return {
    ...common, tool: 'cards',
    base: { size, fitMode: 'fill', copies: c.quantity, ...(plotter ? { cutter: 'plotter', shape: product.shape || 'rect' } : {}) },
    ...(quote && quote.route === 'offset' ? { route: 'offset' } : {}),
  };
}

// A few plain facts for the order list and the job ticket.
export function productSummary(product, choice, quote, priceList) {
  const pl = fullPriceList(priceList);
  const paper = product.kind === 'area' ? findMaterial(pl, choice.material) : findPaper(pl, { id: choice.paper });
  return {
    product: product.id,
    size: choiceSizeName(product, choice),
    paper: paper ? paper.name : null,
    colour: choice.colour !== false,
    laminate: choice.laminate || 'none',
    detail: choiceText(product, choice, pl),
    route: quote.route,
    ...(quote.sheets ? { sheets: quote.sheets, perSheet: quote.ups, sheet: quote.sheetLabel } : {}),
    ...(choice.pages ? { pages: choice.pages } : {}),
    ...(product.kind === 'pad' ? { numberFrom: choice.numberFrom, numberTo: choice.numberFrom + choice.quantity * choice.sets - 1 } : {}),
    ...(quote.sqm ? { sqm: quote.sqm } : {}),
  };
}
