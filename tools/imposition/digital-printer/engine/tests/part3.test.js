// Part 3 tests: printer profiles, flips, margin test sheet, safe zone. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  computeStepRepeat, effectiveMargins, normalizePrinter, DEFAULT_PRINTER, flipEdgeName,
  placeOnSheet, readPdfGeometry, planCards, CARD_DEFAULTS, buildCardsPdf, buildMarginTestPdf,
  getSheet, checkTextSafety, textBoxOnPiece, findEdgeDetail, computeArtFit, getCardWarnings,
  cardStartState, makeSavedDefault, SHEET_ORDER,
} from '../index.js';

const sample = (name) => readFile(new URL(`../../samples/${name}`, import.meta.url));

// ---------- printers ----------

test('different margins per side: grid stays inside the printable area', () => {
  const margins = { top: 12, right: 4, bottom: 4, left: 4 };
  const l = computeStepRepeat({ sheetW: 297, sheetH: 420, itemW: 85, itemH: 50, margins, gap: 3, bleed: 0, marks: true, allowRotate: true });
  assert.ok(l.count > 0);
  const top = Math.min(...l.slots.map((s) => s.y)) - l.outer;
  assert.ok(top >= 12 - 1e-9, `grid top ${top} must be below the 12 mm gripper margin`);
});

test('two-sided jobs use the bigger margin on the mirrored sides', () => {
  const p = { ...DEFAULT_PRINTER, margins: { top: 8, right: 3, bottom: 4, left: 6 } };
  assert.deepEqual(effectiveMargins(p, { twoSided: false }), { top: 8, right: 3, bottom: 4, left: 6 });
  assert.deepEqual(effectiveMargins({ ...p, flip: 'book' }, { twoSided: true }), { top: 8, right: 6, bottom: 4, left: 6 });
  assert.deepEqual(effectiveMargins({ ...p, flip: 'calendar' }, { twoSided: true }), { top: 8, right: 3, bottom: 8, left: 6 });
});

test('normalizePrinter fixes bad values', () => {
  const p = normalizePrinter({ name: '  ', margins: { top: -3, right: 'x', bottom: 99, left: 5 }, sheets: ['A3', 'Nope'], defaultSheet: 'A2' }, SHEET_ORDER);
  assert.equal(p.name, 'Printer');
  assert.deepEqual(p.margins, { top: 0, right: 0, bottom: 50, left: 5 });
  assert.deepEqual(p.sheets, ['A3']);
  assert.equal(p.defaultSheet, 'A3');
});

test('print window flip names', () => {
  assert.equal(flipEdgeName('book', 'portrait'), 'long edge');
  assert.equal(flipEdgeName('book', 'landscape'), 'short edge');
  assert.equal(flipEdgeName('calendar', 'portrait'), 'short edge');
});

test('back side placement for both flips', () => {
  const slot = { x: 10, y: 20, w: 85, h: 50, rotated: false };
  const d = { halfW: 42.5, halfH: 25 };
  const book = placeOnSheet(slot, d, true, 297, 420, 'book');
  assert.deepEqual([book.cx, book.cy, book.rot], [297 - 52.5, 45, 0]);
  const cal = placeOnSheet(slot, d, true, 297, 420, 'calendar');
  assert.deepEqual([cal.cx, cal.cy, cal.rot], [52.5, 420 - 45, 180]);
  const calRot = placeOnSheet({ ...slot, rotated: true }, d, true, 297, 420, 'calendar');
  assert.equal(calRot.rot, 90);
});

test('saved product default is used, but only with sheets the printer has', () => {
  const printer = normalizePrinter({ sheets: ['A4', 'SRA3'], defaultSheet: 'SRA3' }, SHEET_ORDER);
  const saved = makeSavedDefault({ ...CARD_DEFAULTS, sheet: 'A4', orientation: 'landscape', copies: 500 }, { gap: 2 });
  const s = cardStartState(printer, saved);
  assert.equal(s.base.sheet, 'A4');
  assert.equal(s.base.copies, 500);
  assert.equal(s.overrides.gap, 2);
  const other = cardStartState(normalizePrinter({ sheets: ['A3'] }, SHEET_ORDER), saved);
  assert.equal(other.base.sheet, 'A3');
});

test('builds a calendar-flip front/back PDF and a margin test sheet', async () => {
  const bytes = await sample('card-85x50-bleed-front-back.pdf');
  const g = await readPdfGeometry(bytes);
  const printer = normalizePrinter({ flip: 'calendar', margins: { top: 8, right: 4, bottom: 4, left: 4 } }, SHEET_ORDER);
  const plan = planCards({ geometry: g, base: CARD_DEFAULTS, printer });
  assert.ok(plan.layout.count > 0);
  assert.ok((await buildCardsPdf({ sourceBytes: bytes, plan })).length > 1000);
  const test1 = await buildMarginTestPdf({ sheet: getSheet('A3') });
  const tg = await readPdfGeometry(test1);
  assert.equal(tg.pageCount, 2);
  assert.ok((await buildMarginTestPdf({ sheet: getSheet('A6') })).length > 500);
});

// ---------- safe zone: text ----------

test('text box is placed on the finished piece', () => {
  const page = { trimBoxPt: { x: 0, y: 0, width: 241.0, height: 155.9 } }; // 85 x 55 mm
  const fit = computeArtFit({ srcW: 85, srcH: 55, outW: 85, outH: 55 });
  // 10 pt text, baseline 2 mm from the bottom, starting 1 mm from the left
  const mm = 72 / 25.4;
  const box = textBoxOnPiece({ str: 'Hello', transform: [10, 0, 0, 10, 1 * mm, 2 * mm], width: 20, height: 10 }, page, fit);
  assert.ok(Math.abs(box.x - 1) < 0.01);
  const issues = checkTextSafety([box], { outW: 85, outH: 55, safeMm: 3 });
  assert.equal(issues.length, 1);
  assert.ok(['left', 'bottom'].includes(issues[0].edge));
  assert.equal(issues[0].cut, false);
});

test('text past the cut line is reported as cut off', () => {
  const issues = checkTextSafety(
    [{ str: 'Edge', x: -1, y: 20, w: 10, h: 3 }, { str: 'Fine', x: 20, y: 20, w: 10, h: 3 }],
    { outW: 85, outH: 55, safeMm: 3 }
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].cut, true);
});

test('sample card PDF: "FRONT" is too close to the edge', async () => {
  // The sample has text 2.8 mm from the cut. We read its position the same way the app does.
  const g = await readPdfGeometry(await sample('card-85x55-trimbox.pdf'));
  const page = g.pages[0];
  const fit = computeArtFit({ srcW: 85, srcH: 55, srcBleed: 3, outW: 85, outH: 55 });
  const t = page.trimBoxPt;
  const box = textBoxOnPiece({ str: 'FRONT', transform: [14, 0, 0, 14, t.x + 8, t.y + 8], width: 48, height: 14 }, page, fit);
  const issues = checkTextSafety([box], { outW: 85, outH: 55, safeMm: 3 });
  assert.equal(issues[0].str, 'FRONT');
});

// ---------- safe zone: detail in pictures ----------

function canvas(wMm, hMm, k, paint) {
  const width = wMm * k;
  const height = hMm * k;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / k, y / k);
      const p = (y * width + x) * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  return { data, width, height, pxPerMm: k };
}

test('plain colour to the edge is fine', () => {
  const c = canvas(85, 55, 8, () => [20, 110, 180]);
  const r = findEdgeDetail({ ...c, safeMm: 3 });
  assert.equal(r.busy, false);
  assert.equal(r.regions.length, 0);
});

test('text-like stripes 1.5 mm from the left edge are found', () => {
  const c = canvas(85, 55, 8, (x, y) => (x > 1.5 && x < 6 && y > 20 && y < 26 && Math.floor(x * 4) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
  const r = findEdgeDetail({ ...c, safeMm: 3 });
  assert.equal(r.busy, false);
  assert.ok(r.regions.some((g) => g.edge === 'left' && g.y < 26 && g.y + g.h > 20));
  assert.ok(!r.regions.some((g) => g.edge === 'right'));
});

test('a photo-like busy border is reported as busy, not as many problems', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 255;
  const c = canvas(85, 55, 8, () => { const v = rnd(); return [v, v, v]; });
  const r = findEdgeDetail({ ...c, safeMm: 3 });
  assert.equal(r.busy, true);
});

test('safe zone results become tips', async () => {
  const g = await readPdfGeometry(await sample('card-85x50-bleed-front-back.pdf'));
  const plan = planCards({ geometry: g, base: CARD_DEFAULTS });
  const safety = [
    { text: [{ str: 'FRONT', distance: 2.8, edge: 'left', cut: false }], regions: [], busy: false },
    { text: [], regions: [{ edge: 'top' }], busy: false },
  ];
  const ids = getCardWarnings({ plan, geometry: g, safety }).map((n) => n.id);
  assert.ok(ids.includes('text-near-0'));
  assert.ok(ids.includes('detail-near-1'));
  assert.ok(ids.includes('margin-guess'));
  assert.ok(ids.includes('duplex'));
});
