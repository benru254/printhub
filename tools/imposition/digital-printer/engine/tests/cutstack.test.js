// Cut & Stack tests. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  sheetsNeeded, itemAt, stackRanges, formatNumber, resolveDigits, planCutStack, defaultMode,
  buildCutStackPdf, getCutStackWarnings, readPdfGeometry, CARD_DEFAULTS, normalizePrinter, SHEET_ORDER,
  detectProduct, withSecondNumber,
} from '../index.js';

const sample = (name) => readFile(new URL(`../../samples/${name}`, import.meta.url));
const printer = normalizePrinter({ measured: true }, SHEET_ORDER);

// ---------- order maths ----------

test('cut & stack order: after cutting and stacking, everything is in order', () => {
  const total = 10;
  const perSheet = 4;
  const sheets = sheetsNeeded(total, perSheet);
  assert.equal(sheets, 3);
  // Print, cut the pile into stacks (one per spot), put stack 1 on stack 2 on ...
  const result = [];
  for (let slot = 0; slot < perSheet; slot++) {
    for (let s = 0; s < sheets; s++) {
      const item = itemAt(s, slot, sheets, total);
      if (item !== null) result.push(item);
    }
  }
  assert.deepEqual(result, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const stacks = stackRanges(total, perSheet);
  assert.deepEqual(stacks.map((s) => s.count), [3, 3, 3, 1]);
});

test('number formatting', () => {
  assert.equal(formatNumber(7, { prefix: 'No. ', digits: 4 }), 'No. 0007');
  assert.equal(resolveDigits({ start: 1, count: 500, digits: 'auto' }), 4);
  assert.equal(resolveDigits({ start: 9990, count: 50, digits: 'auto' }), 5);
  assert.equal(resolveDigits({ start: 1, count: 50, digits: 6 }), 6);
});

// ---------- plans ----------

test('receipt book: 500 A6 receipts on SRA3 = 8 per sheet (shared cuts), 63 sheets, 10 books of 50', async () => {
  const g = await readPdfGeometry(await sample('receipt-a6.pdf'));
  assert.equal(defaultMode(g), 'number');
  const a3 = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer, numbering: { count: 500 } });
  assert.equal(a3.perSheet, 4); // A3 with real margins and marks: only 4
  const plan = planCutStack({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'SRA3' }, printer, numbering: { count: 500, perBook: 50 } });
  assert.equal(plan.layout.sharedToFit, true);
  assert.equal(plan.settings.gap, 0);
  assert.equal(plan.stackMode, 'number');
  assert.equal(plan.perSheet, 8);
  assert.equal(plan.sheets, 63);
  assert.equal(plan.emptySpots, 4);
  assert.equal(plan.books.count, 10);
  assert.equal(plan.numbering.first, 'No. 0001');
  assert.equal(plan.numbering.last, 'No. 0500');
  const ids = getCutStackWarnings({ plan }).map((n) => n.id);
  assert.ok(ids.includes('empty-spots'));
  assert.ok(!ids.includes('number-edge'));
});

test('duplicate books double the pages; books that are not full are flagged', async () => {
  const g = await readPdfGeometry(await sample('receipt-a6.pdf'));
  const plan = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer, numbering: { count: 120, perBook: 50, parts: 2 } });
  assert.equal(plan.pages, plan.sheets * 2);
  const ids = getCutStackWarnings({ plan }).map((n) => n.id);
  assert.ok(ids.includes('books-split'));
  assert.ok(ids.includes('parts'));
});

test('a number dragged to the edge gets a tip; a second number can be added', async () => {
  const g = await readPdfGeometry(await sample('receipt-a6.pdf'));
  const plan = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer, numbering: { positions: [{ x: 2, y: 2 }] } });
  assert.ok(getCutStackWarnings({ plan }).some((n) => n.id === 'number-edge'));
  assert.equal(withSecondNumber(plan).length, 2);
});

test('pages mode: 12 tickets keep their order', async () => {
  const g = await readPdfGeometry(await sample('tickets-12-pages.pdf'));
  assert.equal(defaultMode(g), 'pages');
  assert.equal(detectProduct(g.pages[0].trimMm, g.pageCount).recommended, 'cutstack');
  const plan = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer });
  assert.equal(plan.total, 12);
  assert.ok(plan.perSheet > 0);
  assert.equal(plan.twoSided, false);
});

// ---------- PDF ----------

test('builds numbered receipts: sets order, 2 copies', async () => {
  const bytes = await sample('receipt-a6.pdf');
  const g = await readPdfGeometry(bytes);
  const plan = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer, numbering: { count: 40, parts: 2 } });
  const pdf = await buildCutStackPdf({ sourceBytes: bytes, plan });
  const back = await readPdfGeometry(pdf);
  assert.equal(back.pageCount, plan.sheets * 2);
});

test('builds a pages-mode PDF', async () => {
  const bytes = await sample('tickets-12-pages.pdf');
  const g = await readPdfGeometry(bytes);
  const plan = planCutStack({ geometry: g, base: CARD_DEFAULTS, printer });
  const pdf = await buildCutStackPdf({ sourceBytes: bytes, plan });
  assert.equal((await readPdfGeometry(pdf)).pageCount, plan.sheets);
});
