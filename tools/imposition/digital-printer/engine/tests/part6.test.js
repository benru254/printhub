// Part 6 tests: copy names, shapes & cut lines, booklets. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  readPdfGeometry, normalizePrinter, SHEET_ORDER, CARD_DEFAULTS,
  planCutStack, buildCutStackPdf, copyNamePosition,
  shapeOutline, outlineToSvg, clampRadius, planCards, buildCardsPdf, buildCutSvg, sheetCutOutlines, getCardWarnings,
  bookletPages, saddleSheets, readerSpreads, planBooklet, buildBookletPdf, getBookletWarnings,
} from '../index.js';

const sample = (name) => readFile(new URL(`../../samples/${name}`, import.meta.url));
const printer = normalizePrinter({ measured: true, sheets: ['A4', 'A3', 'SRA3'] }, SHEET_ORDER);

// ---------- copy names ----------

test('copy names go under the number (or above when there is no room)', () => {
  const box = { w: 18, h: 3 };
  const below = copyNamePosition({ x: 80, y: 8 }, box, { w: 105, h: 148 });
  assert.ok(below.y > 8);
  const above = copyNamePosition({ x: 80, y: 145 }, box, { w: 105, h: 148 });
  assert.ok(above.y < 145);
});

test('duplicate books: copy names only with 2+ copies, and they are in the PDF', async () => {
  const bytes = await sample('receipt-a6.pdf');
  const g = await readPdfGeometry(bytes);
  const single = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer, numbering: { count: 8, parts: 1 } });
  assert.equal(single.numbering.copyNames, false);
  const plan = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer, numbering: { count: 8, parts: 2, copyNameList: ['SHOP COPY', 'CUSTOMER'] } });
  assert.equal(plan.numbering.copyNames, true);
  assert.deepEqual(plan.numbering.copyNameList.slice(0, 2), ['SHOP COPY', 'CUSTOMER']);
  const pdf = await buildCutStackPdf({ sourceBytes: bytes, plan });
  assert.equal((await readPdfGeometry(pdf)).pageCount, plan.sheets * 2);
});

// ---------- shapes & cut lines ----------

test('outlines: rectangle, rounded corners, ellipse', () => {
  assert.equal(shapeOutline({ shape: 'rect', w: 85, h: 55 }).length, 5);
  const r = shapeOutline({ shape: 'rounded', w: 85, h: 55, radius: 3 });
  assert.equal(r.filter((s) => s.op === 'C').length, 4);
  assert.equal(shapeOutline({ shape: 'ellipse', w: 60, h: 60 }).filter((s) => s.op === 'C').length, 4);
  assert.equal(clampRadius(50, 85, 55), 27.5);
  assert.ok(outlineToSvg(r).startsWith('M 3 0 L 82 0 C'));
});

test('sticker cutter: no shared cut lines, cut line in the PDF and the SVG', async () => {
  const bytes = await sample('sticker-60x60.pdf');
  const g = await readPdfGeometry(bytes);
  const base = { ...CARD_DEFAULTS, shape: 'ellipse', cutter: 'plotter', marks: false };
  const plan = planCards({ geometry: g, base, printer });
  assert.equal(plan.shape.cutter, 'plotter');
  assert.ok(plan.settings.gap > 0, 'stickers keep a gap');
  const outlines = sheetCutOutlines(plan.layout, plan.out, plan.shape);
  assert.equal(outlines.length, plan.layout.count);
  // every cut line stays on the sheet
  for (const o of outlines) for (const s of o) if (s.op !== 'Z') assert.ok(s.x >= 0 && s.x <= plan.layout.sheetW && s.y >= 0 && s.y <= plan.layout.sheetH);
  const pdf = await buildCardsPdf({ sourceBytes: bytes, plan });
  const doc = await PDFDocument.load(pdf);
  const spaces = doc.getPage(0).node.Resources().lookup(PDFName.of('ColorSpace'));
  const cs = spaces.lookup(PDFName.of('CutCS'));
  assert.equal(cs.get(0).toString(), '/Separation');
  assert.equal(cs.get(1).toString(), '/CutContour', 'PDF has the CutContour spot colour');
  const svg = buildCutSvg(plan.layout, plan.out, plan.shape);
  assert.equal((svg.match(/<path /g) || []).length, plan.layout.count);
  assert.ok(svg.includes('width="297mm"'));
  const ids = getCardWarnings({ plan, geometry: g }).map((n) => n.id);
  assert.ok(ids.includes('plotter-how'));
});

test('rounded corners on a guillotine: tip to round the corners after cutting', async () => {
  const g = await readPdfGeometry(await sample('card-85x55-trimbox.pdf'));
  const plan = planCards({ geometry: g, base: { ...CARD_DEFAULTS, shape: 'rounded', radius: 4 }, printer });
  assert.ok(getCardWarnings({ plan, geometry: g }).some((n) => n.id === 'corner-cutter'));
  const oval = planCards({ geometry: g, base: { ...CARD_DEFAULTS, shape: 'ellipse' }, printer });
  assert.ok(getCardWarnings({ plan: oval, geometry: g }).some((n) => n.id === 'ellipse-guillotine'));
});

// ---------- booklets ----------

test('booklet page order (saddle stitch)', () => {
  assert.deepEqual(saddleSheets(8), [
    { front: [7, 0], back: [1, 6] },
    { front: [5, 2], back: [3, 4] },
  ]);
  // 10 pages -> 12, blanks before the back cover
  assert.deepEqual(bookletPages(10), [0, 1, 2, 3, 4, 5, 6, 7, 8, null, null, 9]);
  assert.deepEqual(bookletPages(10, 'end'), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, null, null]);
  assert.deepEqual(readerSpreads(8), [[null, 0], [1, 2], [3, 4], [5, 6], [7, null]]);
});

test('A5 booklet: full size on A3 (2 per sheet), shrunk on A4, blank pages tip', async () => {
  const g = await readPdfGeometry(await sample('booklet-a5-10-pages.pdf'));
  const onA3 = planBooklet({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A3' }, printer, booklet: { copies: 50 } });
  assert.equal(onA3.pages, 12);
  assert.equal(onA3.sheetCount, 3);
  assert.equal(onA3.scale, 1);
  assert.equal(onA3.perSheet, 1);
  const onSRA3 = planBooklet({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'SRA3', orientation: 'portrait' }, printer, booklet: { copies: 50 } });
  assert.equal(onSRA3.perSheet, 2);
  assert.equal(onSRA3.sets, 25);
  const onA4 = planBooklet({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A4', orientation: 'landscape' }, printer });
  assert.ok(onA4.scale < 0.9 && onA4.scale > 0.85, `A4 with marks + bleed + 5 mm margins: about 88% (${onA4.scale})`);
  const plain = planBooklet({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A4', orientation: 'landscape', marks: false }, overrides: { bleed: 0 }, printer });
  assert.ok(plain.scale > 0.94, `without marks and bleed: about 95% (${plain.scale})`);
  const ids = getBookletWarnings({ plan: onA4 }).map((n) => n.id);
  assert.ok(ids.includes('shrunk'));
  assert.ok(ids.includes('blank-pages'));
  assert.equal(onA4.best.id, 'SRA3');
});

test('creep: inner sheets move toward the fold', async () => {
  const g = await readPdfGeometry(await sample('document-a4-8-pages.pdf'));
  const many = { ...g, pageCount: 32, pages: Array.from({ length: 32 }, (_, i) => ({ ...g.pages[0], index: i % 8 })) };
  const plan = planBooklet({ geometry: many, base: { ...CARD_DEFAULTS, sheet: 'SRA3', orientation: 'landscape' }, printer, booklet: { paper: 130 } });
  assert.equal(plan.sheetCount, 8);
  assert.equal(plan.shiftFor(0), 0);
  assert.ok(Math.abs(plan.shiftFor(7) - 0.84) < 0.001);
  const off = planBooklet({ geometry: many, base: CARD_DEFAULTS, printer, booklet: { creep: 'off' } });
  assert.equal(off.creepTotal, 0);
});

test('builds the booklet PDF: 2 pages per sheet', async () => {
  const bytes = await sample('booklet-a5-10-pages.pdf');
  const g = await readPdfGeometry(bytes);
  const plan = planBooklet({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'SRA3' }, printer });
  const pdf = await buildBookletPdf({ sourceBytes: bytes, plan });
  assert.equal((await readPdfGeometry(pdf)).pageCount, 6);
});
