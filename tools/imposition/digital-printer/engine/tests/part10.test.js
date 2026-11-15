// Part 10 tests: the product catalogue, product prices (digital, offset, large format),
// large format layouts, work-and-turn, the file check and the small helpers. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  DEFAULT_CATALOGUE, DEFAULT_PRICE_LIST, cleanCatalogue, cleanChoice, findProduct, activeProducts, choiceText, sizeText,
  pricingContext, priceProduct, priceLadder, fromPrice, tablePrice, depositFor, offsetQuote, piecesPerSheet, productRecipe, productSummary,
  fullPriceList, cleanPriceList, quotePrice,
  planLargeFormat, buildLargeFormatPdf, getLargeFormatWarnings, splitCount, panelLength, eyeletPoints, finishToSettings,
  planCards, buildCardsPdf, CARD_DEFAULTS, normalizePrinter, PRINTER_TEMPLATES, SHEET_ORDER, cardStartState, PRESS_STRIP,
  checkArtwork, dpiAtSize, parseMpesa, readyDate, cleanClosedDays, readPdfGeometry,
} from '../index.js';

const ctx = pricingContext({});
const product = (id) => findProduct(DEFAULT_CATALOGUE, id);

async function pdfOf(wMm, hMm, pages = 1) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([(wMm * 72) / 25.4, (hMm * 72) / 25.4]);
    p.drawRectangle({ x: 5, y: 5, width: 40, height: 40, color: rgb(0.1, 0.4, 0.8) });
  }
  return d.save();
}

// ---------- catalogue ----------

test('catalogue: the example list is valid and cleaning it twice changes nothing', () => {
  const once = cleanCatalogue(DEFAULT_CATALOGUE);
  assert.equal(once.products.length, DEFAULT_CATALOGUE.products.length);
  assert.deepEqual(cleanCatalogue(once), once);
  assert.ok(activeProducts(once).length === once.products.length);
  // Every example product can be priced at every one of its quantities.
  for (const p of once.products) for (const row of priceLadder(p, {}, ctx)) assert.ok(row.total > 0, `${p.name} × ${row.quantity}`);
});

test('catalogue: a broken list is refused with a clear message', () => {
  assert.throws(() => cleanCatalogue({ products: [] }), /at least one product/);
  assert.throws(() => cleanCatalogue({ products: [{ name: '', sizes: [] }] }), /enter a name/);
  assert.throws(() => cleanCatalogue({ products: [{ name: 'X', sizes: [{ w: 5, h: 5 }], quantities: [1], papers: ['bond80'] }] }), /between 20 and 450/);
  assert.throws(() => cleanCatalogue({ products: [{ name: 'X', sizes: [{ w: 90, h: 55 }], quantities: [], papers: ['bond80'] }] }), /quantity/);
  // Two products with the same name get different ids; a hidden product stays hidden.
  const c = cleanCatalogue({ products: [
    { name: 'Menus', sizes: [{ w: 210, h: 297 }], quantities: [10, 5, 10], papers: ['art170'] },
    { name: 'Menus', sizes: [{ w: 210, h: 297 }], quantities: [5], papers: ['art170'], active: false },
  ] });
  assert.deepEqual(c.products.map((p) => p.id), ['menus', 'menus-2']);
  assert.deepEqual(c.products[0].quantities, [5, 10]);
  assert.equal(activeProducts(c).length, 1);
});

test('choice: anything the product does not offer becomes its default', () => {
  const cards = product('business-cards');
  const c = cleanChoice(cards, { quantity: 'abc', size: 'A0', paper: 'gold', sides: 7, laminate: 'velvet', w: 9000, h: 1 });
  assert.deepEqual(c, { quantity: 100, size: '90x55', w: 90, h: 55, paper: 'card300', colour: true, laminate: 'none', sides: 2 });
  // Business cards have no "own size"; stickers do.
  assert.equal(cleanChoice(cards, { size: 'custom', w: 60, h: 60 }).size, '90x55');
  const st = cleanChoice(product('stickers'), { size: 'custom', w: 62.4, h: 38 });
  assert.deepEqual([st.size, st.w, st.h], ['custom', 62, 38]);
  assert.equal(cleanChoice(product('stickers'), { size: 'custom', w: 2, h: 38 }).size, '50x50'); // too small: back to the list
  // Booklet pages are rounded UP to what can be bound.
  assert.equal(cleanChoice(product('booklets'), { pages: 13 }).pages, 16);
  assert.equal(cleanChoice(product('booklets'), { pages: 500 }).pages, 64);
  // Banner finishing: the product's usual finishing unless the customer says otherwise.
  assert.deepEqual(cleanChoice(product('banners'), {}).finish, { eyelets: true, hem: true, pockets: false });
  assert.deepEqual(cleanChoice(product('banners'), { finish: { pockets: true } }).finish, { eyelets: false, hem: false, pockets: true });
  assert.equal(cleanChoice(product('receipt-books'), {}).colour, false); // receipt books start black & white
});

test('sizes read the way people say them', () => {
  assert.equal(sizeText(2000, 3000), '2 × 3 m');
  assert.equal(sizeText(1500, 4000), '1.5 × 4 m');
  assert.equal(sizeText(850, 2000), '85 × 200 cm');
  assert.equal(sizeText(90, 55), '90 × 55 mm');
  const b = product('banners');
  assert.equal(choiceText(b, cleanChoice(b, {}), ctx.priceList), '1 × 2 m · PVC banner · eyelets · hemmed');
});

// ---------- product prices ----------

test('pieces per sheet: priced the economical way shops quote', () => {
  const m = { top: 5, right: 5, bottom: 5, left: 5 };
  assert.equal(piecesPerSheet({ w: 148, h: 210, sheetW: 297, sheetH: 420, margins: m }).count, 4); // 4 A5 from an A3
  assert.equal(piecesPerSheet({ w: 210, h: 297, sheetW: 297, sheetH: 420, margins: m }).count, 2);
  assert.equal(piecesPerSheet({ w: 90, h: 55, sheetW: 297, sheetH: 420, margins: m }).count, 21);
  const full = piecesPerSheet({ w: 297, h: 420, sheetW: 297, sheetH: 420, margins: m });
  assert.deepEqual([full.count, full.fullSheet], [1, true]);
  assert.equal(piecesPerSheet({ w: 500, h: 500, sheetW: 297, sheetH: 420, margins: m }).count, 0);
});

test('business cards: the price is built from the price list', () => {
  const q = priceProduct(product('business-cards'), { quantity: 100 }, ctx);
  // 100 cards, 21 per A3 = 5 sheets × (25 card + 2 × 30 colour) = 425, cutting 100 + 5 × 2 = 110 -> 535 -> 540
  assert.deepEqual([q.route, q.ups, q.sheets, q.production, q.total, q.each], ['digital', 21, 5, 540, 540, 5.4]);
  assert.equal(q.lines.length, 2);
  // One side and lamination change it.
  assert.equal(priceProduct(product('business-cards'), { quantity: 100, sides: 1 }, ctx).total, 390); // 5 × 55 + 110 = 385
  assert.equal(priceProduct(product('business-cards'), { quantity: 100, laminate: 'matt' }, ctx).total, 790); // + 5 × 2 × 25
  // A tiny job is never below the minimum order.
  const one = priceProduct(product('posters'), { quantity: 1 }, ctx);
  assert.deepEqual([one.total, one.atMinimum], [300, true]);
  assert.equal(fromPrice(product('business-cards'), ctx), 540);
});

test('a size too big for the shop sheets is "price on request", never a wrong price', () => {
  const q = priceProduct(product('stickers'), { size: 'custom', w: 440, h: 440, quantity: 10 }, ctx);
  assert.deepEqual([q.onRequest, q.total], [true, 0]);
});

test('price table: the shop pins a price; other options add what they cost', () => {
  const cards = { ...product('business-cards'), priceTable: [{ qty: 100, price: 500 }, { qty: 500, price: 1500 }] };
  assert.equal(priceProduct(cards, { quantity: 100 }, ctx).total, 500);
  assert.equal(priceProduct(cards, { quantity: 500 }, ctx).total, 1500);
  assert.equal(priceProduct(cards, { quantity: 300 }, ctx).total, 1000); // half way between
  assert.equal(priceProduct(cards, { quantity: 1000 }, ctx).total, 3000); // 3 each, like the last row
  // Matt lamination on 100 cards costs 5 sheets × 2 sides × 25 = 250 more than the table price.
  const lam = priceProduct(cards, { quantity: 100, laminate: 'matt' }, ctx);
  assert.deepEqual([lam.total, lam.fromTable, lam.lines.length], [750, true, 2]);
  // One side is cheaper than the table's two sides: 5 sheets × 30 less.
  assert.equal(priceProduct(cards, { quantity: 100, sides: 1 }, ctx).total, 350);
  assert.equal(tablePrice([{ qty: 100, price: 500 }], 20), 500); // below the list: the smallest price
  assert.equal(tablePrice([], 20), null);
  assert.equal(priceProduct({ ...cards, priceTable: [{ qty: '100', price: '500' }] }, { quantity: 100 }, ctx).total, 500); // typed as text
});

test('offset: big runs go to the press when that is cheaper, and take longer', () => {
  const flyers = product('flyers');
  const small = priceProduct(flyers, { quantity: 500 }, ctx);
  const big = priceProduct(flyers, { quantity: 5000 }, ctx);
  assert.equal(small.route, 'digital');
  assert.equal(big.route, 'offset');
  assert.ok(big.each < small.each / 2, 'the price per flyer falls a lot');
  assert.equal(big.days, flyers.days + ctx.priceList.offset.extraDays);
  assert.equal(big.express.offered, false); // a press run cannot be rushed
  assert.equal(small.express.offered, false); // already ready in 1 day
  // Both sides with an even number per sheet: work and turn = 4 plates instead of 8.
  const cards = offsetQuote(product('business-cards'), cleanChoice(product('business-cards'), { quantity: 5000 }), ctx.priceList);
  assert.deepEqual([cards.turn, cards.plates, cards.ups % 2], [true, 4, 0]);
  const mono = offsetQuote(flyers, cleanChoice(flyers, { quantity: 5000, sides: 1 }), ctx.priceList);
  assert.equal(mono.plates, 4);
  // Offset switched off, a product that never goes offset, or a small job: always digital.
  const off = pricingContext({ priceList: { ...DEFAULT_PRICE_LIST, offset: { ...DEFAULT_PRICE_LIST.offset, enabled: false } } });
  assert.equal(priceProduct(flyers, { quantity: 5000 }, off).route, 'digital');
  assert.equal(priceProduct(product('invitation-cards'), { quantity: 5000 }, ctx).route, 'digital');
  assert.equal(offsetQuote(flyers, cleanChoice(flyers, { quantity: 100 }), ctx.priceList), null);
});

test('the quantity buttons show the saving per piece', () => {
  const rows = priceLadder(product('business-cards'), {}, ctx);
  assert.deepEqual(rows.map((r) => r.quantity), [100, 200, 500, 1000]);
  assert.equal(rows[0].saves, 0);
  assert.ok(rows[3].saves >= 15 && rows[3].saves <= 30, `1000 cards save ${rows[3].saves}%`);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].each <= rows[i - 1].each);
});

test('extras: design help, express and delivery are added on top, the deposit is rounded', () => {
  const inv = product('invitation-cards'); // 2 days, so express (1 day) is on offer
  const plain = priceProduct(inv, { quantity: 100 }, ctx);
  assert.deepEqual([plain.total, plain.days, plain.express.offered, plain.express.amount], [850, 2, true, 260]);
  const all = priceProduct(inv, { quantity: 100 }, ctx, { artwork: 'design', speed: 'express', delivery: 'deliver' });
  assert.deepEqual(all.extras.map((l) => [l.key, l.amount]), [['design', 500], ['express', 260], ['delivery', 200]]);
  assert.deepEqual([all.production, all.total, all.days, all.speed], [850, 1810, 1, 'express']);
  // A product can have its own design fee; delivery switched off is never charged.
  assert.equal(priceProduct({ ...inv, designFee: 1200 }, { quantity: 100 }, ctx, { artwork: 'design' }).total, 2050);
  const noDelivery = pricingContext({ priceList: { ...DEFAULT_PRICE_LIST, delivery: { enabled: false, fee: 200 } } });
  assert.equal(priceProduct(inv, { quantity: 100 }, noDelivery, { delivery: 'deliver' }).total, 850);
  assert.equal(depositFor(1810, 50, ctx.priceList), 910);
  assert.equal(depositFor(1810, 0, ctx.priceList), 0);
  assert.equal(depositFor(300, 100, ctx.priceList), 300);
});

test('large format: priced per square metre with finishing', () => {
  const q = priceProduct(product('banners'), { size: '1x2', quantity: 1 }, ctx);
  // 2 m² × 700 = 1400, hem 6 m × 50 = 300, 12 eyelets × 10 = 120
  assert.deepEqual([q.route, q.sqm, q.eyelets, q.total], ['large', 2, 12, 1820]);
  assert.equal(priceProduct(product('banners'), { size: '1x2', quantity: 1, finish: {} }, ctx).total, 1400);
  // The stand is part of a roll-up.
  const r = priceProduct(product('rollup'), {}, ctx);
  assert.equal(r.total, 6050); // 1.7 m² × 1500 = 2550 + stand 3500
  // A very small print is charged the smallest area.
  const tiny = priceProduct(product('vinyl'), { size: 'custom', w: 200, h: 200, quantity: 1 }, ctx);
  assert.equal(tiny.lines[0].amount, 550);
  // Own size in metres.
  assert.equal(priceProduct(product('banners'), { size: 'custom', w: 1500, h: 4000, quantity: 2, finish: {} }, ctx).total, 8400);
});

test('booklets and receipt books: pages, covers, copies and numbering', () => {
  const b = priceProduct(product('booklets'), { quantity: 10, pages: 12 }, ctx);
  assert.equal(b.route, 'digital');
  assert.deepEqual(b.spec.groups.map((g) => [g.label, g.sheets, g.paper]), [['Inside pages', 10, 'art130'], ['Cover', 5, 'card250']]);
  assert.equal(b.spec.binding, 'staple');
  assert.equal(priceProduct(product('books'), { quantity: 1, pages: 100 }, ctx).spec.binding, 'glue');
  const pads = product('receipt-books');
  const c = cleanChoice(pads, { quantity: 5, parts: 2, sets: 50, numberFrom: 251 });
  const q = priceProduct(pads, c, ctx);
  assert.equal(q.sheets, 125); // 5 books × 50 sets × 2 copies = 500 A5 leaves, 4 per A3
  const recipe = productRecipe(pads, c, q);
  assert.equal(recipe.tool, 'cutstack');
  assert.deepEqual(recipe.extra.numbering, { start: 251, count: 250, parts: 2, perBook: 50 });
  const s = productSummary(pads, c, q, ctx.priceList);
  assert.deepEqual([s.numberFrom, s.numberTo], [251, 500]);
});

test('recipes open the right tool with the customer\'s choices', () => {
  const cards = product('business-cards');
  const c = cleanChoice(cards, { quantity: 500 });
  const r = productRecipe(cards, c, priceProduct(cards, c, ctx));
  assert.deepEqual([r.tool, r.base.size, r.base.copies, r.product.id], ['cards', { w: 90, h: 55 }, 500, 'business-cards']);
  const st = product('stickers');
  assert.equal(productRecipe(st, cleanChoice(st, {}), {}).base.cutter, 'plotter');
  const bn = product('banners');
  const rb = productRecipe(bn, cleanChoice(bn, { size: '2x3' }), {});
  assert.deepEqual([rb.tool, rb.base.w, rb.base.h, rb.base.finish.hem], ['largeformat', 2000, 3000, true]);
  assert.equal(productRecipe(product('booklets'), cleanChoice(product('booklets'), {}), {}).tool, 'booklet');
  assert.equal(productRecipe(product('books'), cleanChoice(product('books'), {}), {}).tool, 'perfectbound');
  const big = cleanChoice(product('flyers'), { quantity: 5000 });
  assert.equal(productRecipe(product('flyers'), big, priceProduct(product('flyers'), big, ctx)).route, 'offset');
});

test('price list: an old saved list still works, and the new parts are checked', () => {
  const old = { v: 1, currency: 'KES', papers: [{ id: 'bond80', name: 'Plain', gsm: 80, priceA3: 6 }], print: { colour: 40, mono: 10 } };
  const full = fullPriceList(old);
  assert.equal(full.papers.length, 1);
  assert.equal(full.print.colour, 40);
  assert.equal(full.largeFormat.materials.length, DEFAULT_PRICE_LIST.largeFormat.materials.length);
  assert.equal(full.offset.plate, DEFAULT_PRICE_LIST.offset.plate);
  // The old function still prices from it.
  assert.ok(quotePrice({ groups: [{ sheets: 10, sheetW: 297, sheetH: 420, sides: 1 }], cut: 'none' }, {}, full).total > 0);
  const clean = cleanPriceList({ ...DEFAULT_PRICE_LIST, largeFormat: { ...DEFAULT_PRICE_LIST.largeFormat, materials: [{ name: ' Mesh ', pricePerSqm: '900', rollWidth: 3200 }] }, offset: { enabled: false, plate: 650 }, rush: { enabled: true, pct: 50, days: 0 } });
  assert.deepEqual(clean.largeFormat.materials, [{ id: 'material1', name: 'Mesh', pricePerSqm: 900, rollWidth: 3200 }]);
  assert.deepEqual([clean.offset.enabled, clean.offset.plate, clean.offset.setup], [false, 650, DEFAULT_PRICE_LIST.offset.setup]);
  assert.deepEqual(clean.rush, { enabled: true, pct: 50, days: 0 });
  assert.equal(clean.example, false);
  assert.throws(() => cleanPriceList({ ...DEFAULT_PRICE_LIST, largeFormat: { materials: [{ name: 'X', pricePerSqm: 5, rollWidth: 50 }] } }), /roll width/);
  assert.throws(() => cleanPriceList({ ...DEFAULT_PRICE_LIST, design: { fee: -5 } }), /Design fee/);
});

// ---------- large format ----------

test('large format: one piece when the roll is wide enough, parts when it is not', async () => {
  const geometry = await readPdfGeometry(await pdfOf(100, 200));
  const wide = planLargeFormat({ geometry, base: { w: 1000, h: 2000, rollWidth: 3200, hem: 25, eyelets: true } });
  assert.deepEqual([wide.panels.length, wide.fits, wide.scale], [1, true, 1]);
  assert.deepEqual(wide.print, { w: 1050, h: 2050 });
  assert.equal(wide.eyelets.length, 12);
  assert.equal(wide.fill, 'mirror'); // the file has no bleed, so the hem is mirrored

  // 2 × 3 m on a 1.52 m roll: two strips, turned so the join is the short way.
  const narrow = planLargeFormat({ geometry, base: { w: 2000, h: 3000, rollWidth: 1520, hem: 25 } });
  assert.equal(narrow.panels.length, 2);
  const covered = narrow.across === 'w' ? narrow.panels[0].w * 2 - narrow.overlap : narrow.panels[0].h * 2 - narrow.overlap;
  assert.ok(Math.abs(covered - (narrow.across === 'w' ? narrow.print.w : narrow.print.h)) < 0.01, 'the two parts cover the whole print');
  assert.ok(Math.max(narrow.panel.w, narrow.panel.h) > 0 && Math.min(narrow.panel.w, narrow.panel.h) <= 1520 - 2 * narrow.edge - 2 * narrow.slug + 0.01);
  assert.ok(getLargeFormatWarnings({ plan: narrow }).some((n) => n.id === 'lf-panels'));

  // Longer than 5 m: the file is made at 10%.
  const long = planLargeFormat({ geometry, base: { w: 1000, h: 8000, rollWidth: 1520, allowRotate: false } });
  assert.equal(long.scale, 0.1);
  assert.ok(getLargeFormatWarnings({ plan: long }).some((n) => n.id === 'lf-scale'));

  // A roll that is far too narrow never crashes.
  const silly = planLargeFormat({ geometry, base: { w: 5000, h: 5000, rollWidth: 100 } });
  assert.deepEqual([silly.fits, silly.panels.length], [false, 0]);
  assert.equal(getLargeFormatWarnings({ plan: silly })[0].id, 'lf-no-fit');
});

test('large format: the split maths', () => {
  assert.equal(splitCount(1000, 1500, 20), 1);
  assert.equal(splitCount(2050, 1494, 20), 2);
  assert.equal(splitCount(3000, 1000, 20), 4); // 3 × 1000 would leave no overlap
  assert.equal(panelLength(2050, 2, 20), 1035);
  assert.equal(splitCount(100, 10, 20), Infinity);
  const pts = eyeletPoints(1000, 2000);
  assert.equal(pts.length, 12);
  assert.deepEqual(pts[0], { x: 20, y: 20 }); // one in every corner
  assert.ok(pts.some((p) => p.x === 980 && p.y === 1980));
  assert.deepEqual(finishToSettings({ hem: true, eyelets: true }), { hem: 25, eyelets: true, pocketTop: 0, pocketBottom: 0 });
});

test('large format: builds one page per part, at the right size', async () => {
  const bytes = await pdfOf(100, 200);
  const geometry = await readPdfGeometry(bytes);
  const one = planLargeFormat({ geometry, base: { w: 1000, h: 2000, rollWidth: 3200, hem: 25, eyelets: true } });
  const pdf1 = await PDFDocument.load(await buildLargeFormatPdf({ sourceBytes: bytes, plan: one, title: 'Test banner' }));
  assert.equal(pdf1.getPageCount(), 1);
  const size = pdf1.getPage(0).getSize();
  assert.ok(Math.abs((size.width * 25.4) / 72 - (1050 + 16)) < 0.1 && Math.abs((size.height * 25.4) / 72 - (2050 + 16)) < 0.1);

  // A poster tiled on A4 sheets: every page is an A4.
  const tiles = planLargeFormat({ geometry, base: { w: 420, h: 594, media: 'sheet', sheetW: 210, sheetH: 297, hem: 0, bleed: 0, overlap: 10 } });
  assert.ok(tiles.panels.length >= 4 && tiles.panels.length <= 9, `${tiles.panels.length} sheets`);
  const pdf2 = await PDFDocument.load(await buildLargeFormatPdf({ sourceBytes: bytes, plan: tiles }));
  assert.equal(pdf2.getPageCount(), tiles.panels.length);
  const a4 = pdf2.getPage(0).getSize();
  assert.ok(Math.abs(Math.min(a4.width, a4.height) - 595.28) < 1);

  // 10% scale: an 8 m banner comes out 80 cm long.
  const long = planLargeFormat({ geometry, base: { w: 1000, h: 8000, rollWidth: 1520, allowRotate: false } });
  const pdf3 = await PDFDocument.load(await buildLargeFormatPdf({ sourceBytes: bytes, plan: long }));
  assert.ok(Math.abs((pdf3.getPage(0).getSize().height * 25.4) / 72 - (8006 + 16) / 10) < 0.2);

  const silly = planLargeFormat({ geometry, base: { w: 5000, h: 5000, rollWidth: 100 } });
  await assert.rejects(buildLargeFormatPdf({ sourceBytes: bytes, plan: silly }), /does not fit/);
});

// ---------- offset: work and turn, press marks ----------

test('work and turn: fronts and backs share one sheet side', async () => {
  const bytes = await pdfOf(90, 55, 2);
  const geometry = await readPdfGeometry(bytes);
  const press = normalizePrinter(PRINTER_TEMPLATES.find((t) => t.key === 'offset-press').values, SHEET_ORDER);
  assert.equal(press.press, true);
  const start = cardStartState(press, null);
  assert.deepEqual([start.base.pressMarks, start.base.workAndTurn, start.base.sheet], [true, true, 'SRA2']);

  const plan = planCards({ geometry, base: { ...start.base, makeBleed: 'off' }, printer: press });
  assert.equal(plan.workAndTurn, true);
  assert.equal(plan.layout.cols % 2, 0);
  assert.equal(plan.layout.margins.left, plan.layout.margins.right);
  assert.equal(plan.layout.margins.top, press.margins.top + PRESS_STRIP);
  assert.ok(plan.pressMarks.bar.length > 20 && plan.pressMarks.targets.length === 3);
  // The colour bar sits above the pieces, inside the sheet.
  for (const b of plan.pressMarks.bar) assert.ok(b.y >= press.margins.top && b.y + b.h <= plan.layout.grid.y);

  const turned = await PDFDocument.load(await buildCardsPdf({ sourceBytes: bytes, plan }));
  assert.equal(turned.getPageCount(), 1);
  const normal = planCards({ geometry, base: { ...start.base, workAndTurn: false, pressMarks: false, makeBleed: 'off' }, printer: press });
  assert.deepEqual([normal.workAndTurn, normal.pressMarks], [false, null]);
  assert.equal((await PDFDocument.load(await buildCardsPdf({ sourceBytes: bytes, plan: normal }))).getPageCount(), 2);
  // A one-sided job is never work and turn; an ordinary printer never gets press marks by itself.
  const single = await readPdfGeometry(await pdfOf(90, 55, 1));
  assert.equal(planCards({ geometry: single, base: { ...start.base, makeBleed: 'off' }, printer: press }).workAndTurn, false);
  assert.deepEqual([CARD_DEFAULTS.pressMarks, CARD_DEFAULTS.workAndTurn], [false, false]);
});

// ---------- file check ----------

test('file check: size, shape, sharpness and pages in plain words', async () => {
  const cards = product('business-cards');
  const c = cleanChoice(cards, {});
  const right = checkArtwork({ product: cards, choice: c, geometry: await readPdfGeometry(await pdfOf(90, 55, 2)) });
  assert.equal(right.level, 'good');
  // Turned the other way round is still the right size.
  assert.equal(checkArtwork({ product: cards, choice: c, geometry: await readPdfGeometry(await pdfOf(55, 90, 2)) }).level, 'good');
  // An A4 page for a business card: different shape, the shop fixes it.
  const a4 = checkArtwork({ product: cards, choice: c, geometry: await readPdfGeometry(await pdfOf(210, 297, 2)) });
  assert.equal(a4.level, 'check');
  assert.match(a4.lines[0].text, /different shape/);
  // One side chosen, the file has two: switch to both sides.
  const one = checkArtwork({ product: cards, choice: cleanChoice(cards, { sides: 1 }), geometry: await readPdfGeometry(await pdfOf(90, 55, 2)) });
  assert.equal(one.suggest.sides, 2);
  // A small phone picture for a 2 m banner.
  const banner = product('banners');
  const g = await readPdfGeometry(await pdfOf(100, 200));
  const low = checkArtwork({ product: banner, choice: cleanChoice(banner, {}), geometry: g, imageInfo: [{ px: { w: 400, h: 800 } }] });
  assert.equal(low.level, 'low');
  const fine = checkArtwork({ product: banner, choice: cleanChoice(banner, {}), geometry: g, imageInfo: [{ px: { w: 3000, h: 6000 } }] });
  assert.equal(fine.level, 'good');
  assert.equal(dpiAtSize({ w: 1063, h: 650 }, 90, 55), 300);
  assert.equal(dpiAtSize({ w: 650, h: 1063 }, 90, 55), 300); // a sideways picture
  // A booklet takes its page count from the file.
  const bk = product('booklets');
  assert.equal(checkArtwork({ product: bk, choice: cleanChoice(bk, {}), geometry: await readPdfGeometry(await pdfOf(148, 210, 16)) }).suggest.pages, 16);
});

// ---------- small helpers ----------

test('M-Pesa: the code and amount are read from a pasted message', () => {
  assert.deepEqual(parseMpesa('TKA1B2C3D4 Confirmed. Ksh1,500.00 sent to PRINT SHOP 0712345678 on 14/11/26 at 9:15 AM. New M-PESA balance is Ksh2,040.50.'), { code: 'TKA1B2C3D4', amount: 1500 });
  assert.deepEqual(parseMpesa(' tka1b2c3d4 '), { code: 'TKA1B2C3D4', amount: null });
  assert.deepEqual(parseMpesa('TKA 1B2C 3D4'), { code: 'TKA1B2C3D4', amount: null });
  assert.deepEqual(parseMpesa('I paid yesterday'), { code: null, amount: null });
  assert.equal(parseMpesa('0712345678').code, null); // a phone number is not a code
  assert.equal(parseMpesa('CONFIRMED').code, null);
});

test('ready dates skip the days the shop is closed', () => {
  const sat = new Date(2026, 10, 14, 10, 0); // Saturday 14 Nov 2026
  assert.equal(readyDate(sat, 0, [0]).getDate(), 14);
  assert.equal(readyDate(sat, 1, [0]).getDate(), 16); // Sunday is skipped: Monday
  assert.equal(readyDate(sat, 2, [0]).getDate(), 17);
  assert.equal(readyDate(sat, 1, []).getDate(), 15);
  assert.equal(readyDate(new Date(2026, 10, 15, 10, 0), 0, [0]).getDate(), 16); // ordered on a closed day
  assert.equal(readyDate(sat, 1, [0, 6]).getDate(), 17);
  assert.deepEqual(cleanClosedDays([0, 0, 9, 'x', 6]), [0, 6]);
  assert.deepEqual(cleanClosedDays([0, 1, 2, 3, 4, 5, 6]), [0]); // closed every day makes no sense
});
