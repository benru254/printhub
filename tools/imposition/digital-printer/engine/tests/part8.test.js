// Part 8 tests: straightening rotated pages and the price list. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  straightenPdf, readPdfGeometry, quotePrice, cleanPriceList, formatMoney, findPaper, DEFAULT_PRICE_LIST,
  planCards, CARD_DEFAULTS, normalizePrinter, SHEET_ORDER,
} from '../index.js';

async function rotatedPdf(angle) {
  const d = await PDFDocument.create();
  const p = d.addPage([200, 300]); // stored portrait
  p.setRotation(degrees(angle));
  p.setTrimBox(20, 30, 160, 240);
  d.addPage([200, 300]); // a normal page
  return d.save();
}

// ---------- rotated pages ----------

test('straighten: a page stored sideways becomes upright, boxes turn with it', async () => {
  const { bytes, straightened } = await straightenPdf(await rotatedPdf(90));
  assert.deepEqual(straightened, [0]);
  const g = await readPdfGeometry(bytes);
  assert.equal(g.pageCount, 2);
  assert.equal(g.pages[0].rotation, 0);
  // 160 x 240 pt trim, seen sideways = 240 x 160 pt = 84.7 x 56.4 mm
  assert.ok(Math.abs(g.pages[0].trimMm.w - 84.67) < 0.1 && Math.abs(g.pages[0].trimMm.h - 56.44) < 0.1);
  // The trim box keeps its distance from the page edges: 30 pt from the left, 20 pt from the top.
  assert.ok(Math.abs(g.pages[0].trimBoxPt.x - 30) < 0.01);
  assert.ok(Math.abs(g.pages[0].trimBoxPt.y - 20) < 0.01);
});

test('straighten: 180 keeps the size, 270 swaps it', async () => {
  const a = await readPdfGeometry((await straightenPdf(await rotatedPdf(180))).bytes);
  assert.ok(a.pages[0].trimMm.w < a.pages[0].trimMm.h);
  const b = await readPdfGeometry((await straightenPdf(await rotatedPdf(270))).bytes);
  assert.ok(b.pages[0].trimMm.w > b.pages[0].trimMm.h);
  assert.equal(b.pages[0].rotation, 0);
});

test('straighten: a normal file comes back untouched', async () => {
  const d = await PDFDocument.create();
  d.addPage([200, 300]);
  const bytes = await d.save();
  const r = await straightenPdf(bytes);
  assert.equal(r.bytes, bytes);
  assert.deepEqual(r.straightened, []);
});

test('files with empty pages build (they print as blank paper)', async () => {
  const { planBooklet, buildBookletPdf, planCutStack, buildCutStackPdf, buildCardsPdf, NUMBERING_DEFAULTS } = await import('../index.js');
  const d = await PDFDocument.create();
  for (let i = 0; i < 8; i++) {
    const p = d.addPage([419.5, 595.3]);
    if (i !== 2) p.drawRectangle({ x: 50, y: 50, width: 100, height: 100 });
  }
  const bytes = await d.save();
  const g = await readPdfGeometry(bytes);
  const printer = normalizePrinter({ measured: true, sheets: ['A4', 'A3'] }, SHEET_ORDER);
  const base = { ...CARD_DEFAULTS, sheet: 'A3' };
  assert.ok((await buildBookletPdf({ sourceBytes: bytes, plan: planBooklet({ geometry: g, base, printer }) })).length > 500);
  assert.ok((await buildCutStackPdf({ sourceBytes: bytes, plan: planCutStack({ geometry: g, base, printer, mode: 'pages', numbering: NUMBERING_DEFAULTS }) })).length > 500);
  const one = await PDFDocument.create();
  one.addPage([241, 156]);
  const oneBytes = await one.save();
  assert.ok((await buildCardsPdf({ sourceBytes: oneBytes, plan: planCards({ geometry: await readPdfGeometry(oneBytes), base, printer }) })).length > 500);
});

// ---------- prices ----------

const cards = (sheets, sides = 1) => ({ groups: [{ label: 'Printing', sheets, sheetW: 297, sheetH: 420, sides }], cut: 'guillotine' });

test('price: paper + printing + cutting, rounded up', () => {
  // 5 A3 sheets x (25 paper + 30 print) = 275, cutting 100 + 5 x 2 = 110 -> 385 -> 390
  const q = quotePrice(cards(5), { paper: 'card300' });
  assert.equal(q.total, 390);
  assert.equal(q.lines.length, 2);
  assert.equal(q.discountPct, 0);
  assert.equal(q.example, true);
});

test('price: both sides and lamination cost more; black & white costs less', () => {
  const one = quotePrice(cards(10), { paper: 'card300' }).total;
  const two = quotePrice(cards(10, 2), { paper: 'card300' }).total;
  const lam = quotePrice(cards(10, 2), { paper: 'card300', laminate: 'matt' }).total;
  const mono = quotePrice(cards(10), { paper: 'card300', colour: false }).total;
  assert.ok(two > one && lam > two && mono < one);
  assert.equal(lam - two, 25 * 2 * 10);
});

test('price: quantity discount applies to paper and printing only', () => {
  const q = quotePrice(cards(100), { paper: 'card300' });
  assert.equal(q.discountPct, 10);
  assert.equal(q.discount, 550); // 10% of 100 x 55
  assert.equal(q.total, 5500 - 550 + 300);
});

test('price: small jobs pay the minimum order; nothing to print costs nothing', () => {
  const q = quotePrice(cards(1), { paper: 'bond80' });
  assert.equal(q.total, DEFAULT_PRICE_LIST.minOrder);
  assert.equal(q.atMinimum, true);
  assert.equal(quotePrice(cards(0), {}).total, 0);
});

test('price: books use the paper weight of each part, plus binding', () => {
  const q = quotePrice({
    groups: [
      { label: 'Inside pages', sheets: 48, sheetW: 297, sheetH: 420, sides: 2, gsm: 80, noLaminate: true },
      { label: 'Cover', sheets: 10, sheetW: 320, sheetH: 450, sides: 1, gsm: 300 },
    ],
    cut: 'guillotine', books: 20, binding: 'glue',
  }, { laminate: 'gloss' });
  assert.match(q.lines[0].detail, /Plain paper 80 gsm/);
  assert.match(q.lines[1].detail, /Art card 300 gsm/);
  assert.equal(q.lines.filter((l) => /lamination/.test(l.label)).length, 1); // the cover only
  assert.equal(q.lines.find((l) => l.label === 'Glue binding').amount, 2400);
});

test('price: stickers use sticker paper and the plotter cut', () => {
  const q = quotePrice({ groups: [{ sheets: 4, sheetW: 297, sheetH: 420, sides: 1, sticker: true }], cut: 'contour' }, {});
  assert.match(q.lines[0].detail, /Sticker paper/);
  assert.equal(q.lines[1].amount, 160);
  assert.equal(findPaper(DEFAULT_PRICE_LIST, { gsm: 290 }).id, 'card300');
});

test('price list: the owner\'s list is checked and cleaned', () => {
  const clean = cleanPriceList({ ...DEFAULT_PRICE_LIST, minOrder: '450', papers: [{ name: ' Ivory board ', priceA3: '35', gsm: 300 }] });
  assert.equal(clean.example, false);
  assert.equal(clean.minOrder, 450);
  assert.deepEqual(clean.papers, [{ id: 'paper1', name: 'Ivory board', gsm: 300, priceA3: 35 }]);
  assert.throws(() => cleanPriceList({ papers: [] }), /at least one paper/);
  assert.throws(() => cleanPriceList({ papers: [{ name: 'X', priceA3: -1 }] }), /0 or more/);
  assert.equal(formatMoney(1250), 'KSh 1,250');
});

test('copies typed as letters or zero still plan at least one piece', async () => {
  const d = await PDFDocument.create();
  d.addPage([241, 156]);
  const g = await readPdfGeometry(await d.save());
  const printer = normalizePrinter({ measured: true, sheets: ['A3'] }, SHEET_ORDER);
  for (const copies of ['abc', 0, -5, null]) {
    assert.equal(planCards({ geometry: g, base: { ...CARD_DEFAULTS, copies }, printer }).sheetsNeeded, 1);
  }
});
