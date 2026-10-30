// Part 7 tests: contour cut (follow the design) and perfect-bound books. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  readPdfGeometry, normalizePrinter, SHEET_ORDER, CARD_DEFAULTS, detectProduct,
  contourFromPixels, planCards, buildCardsPdf, buildCutSvg, getCardWarnings, pieceOutline,
  signatureSizes, planPerfectBound, buildBookInsidePdf, buildCoverPdf, getPerfectBoundWarnings,
} from '../index.js';

const sample = (name) => readFile(new URL(`../../samples/${name}`, import.meta.url));
const printer = normalizePrinter({ measured: true, sheets: ['A4', 'A3', 'SRA3'] }, SHEET_ORDER);

// A 60 x 60 mm transparent picture at 10 px/mm with a filled circle (r 20 mm) in the middle.
function circlePixels({ r = 20, hole = 0 } = {}) {
  const pxPerMm = 10;
  const width = 600;
  const height = 600;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - 300, y + 0.5 - 300) / pxPerMm;
      if (d <= r && d >= hole) {
        const i = (y * width + x) * 4;
        data[i] = 200;
        data[i + 3] = 255;
      }
    }
  }
  return { data, width, height, pxPerMm };
}

function radii(outlines) {
  const pts = outlines.flat().filter((p) => p.op !== 'Z');
  return pts.map((p) => Math.hypot(p.x - 30, p.y - 30));
}

// ---------- contour cut ----------

test('contour: the cut line goes round the design at the border distance', () => {
  const c = contourFromPixels({ ...circlePixels(), offsetMm: 2 });
  assert.equal(c.pieces, 1);
  const r = radii(c.outlines);
  assert.ok(Math.min(...r) > 21.5 && Math.max(...r) < 22.4, `radius ${Math.min(...r)}..${Math.max(...r)}`);
});

test('contour: holes inside the design are not cut out', () => {
  const c = contourFromPixels({ ...circlePixels({ hole: 8 }), offsetMm: 1 });
  assert.equal(c.outlines.length, 1); // only the outside line
  assert.ok(Math.min(...radii(c.outlines)) > 20);
});

test('contour: an empty picture finds nothing', () => {
  const c = contourFromPixels({ data: new Uint8ClampedArray(100 * 100 * 4), width: 100, height: 100, pxPerMm: 10 });
  assert.equal(c.outlines.length, 0);
});

test('contour stickers: plotter cut, CutContour in the PDF and a matching SVG', async () => {
  const bytes = await sample('sticker-60x60.pdf');
  const g = await readPdfGeometry(bytes);
  const contour = contourFromPixels({ ...circlePixels(), offsetMm: 2 });
  const base = { ...CARD_DEFAULTS, shape: 'contour', marks: false };
  const plan = planCards({ geometry: g, base, printer, contour });
  assert.equal(plan.shape.cutter, 'plotter');
  assert.equal(plan.shape.found, true);
  assert.ok(plan.layout.count > 0);
  // The piece outline is the contour, not the rectangle.
  assert.ok(pieceOutline(plan.shape, 60, 60).length > 8);

  const pdf = await buildCardsPdf({ sourceBytes: bytes, plan });
  const doc = await PDFDocument.load(pdf);
  const cs = doc.getPage(0).node.Resources().lookup(PDFName.of('ColorSpace')).lookup(PDFName.of('CutCS'));
  assert.equal(cs.get(1).toString(), '/CutContour');

  const svg = buildCutSvg(plan.layout, plan.out, plan.shape);
  assert.equal((svg.match(/<path /g) || []).length, plan.layout.count);

  const ids = getCardWarnings({ plan, geometry: g }).map((n) => n.id);
  assert.ok(!ids.includes('marks-off'));
});

test('contour stickers: while the outline is still being found, nothing is claimed', async () => {
  const g = await readPdfGeometry(await sample('sticker-60x60.pdf'));
  const plan = planCards({ geometry: g, base: { ...CARD_DEFAULTS, shape: 'contour' }, printer, contour: null });
  assert.equal(plan.shape.found, false);
});

// ---------- perfect-bound books ----------

test('signatures: 96 pages in 16s = 6, and the last can be smaller', () => {
  assert.deepEqual(signatureSizes(96, 16), [16, 16, 16, 16, 16, 16]);
  assert.deepEqual(signatureSizes(40, 16), [16, 16, 8]);
});

test('detect: a 98-page A5 file is a glued book', async () => {
  const g = await readPdfGeometry(await sample('book-a5-98-pages.pdf'));
  assert.equal(detectProduct(g.pages[0].trimMm, g.pageCount).recommended, 'perfectbound');
});

test('perfect bound: cover out of the file, 96 inside pages, signatures in order', async () => {
  const g = await readPdfGeometry(await sample('book-a5-98-pages.pdf'));
  const plan = planPerfectBound({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A3', orientation: 'portrait' }, printer, book: { signature: 16 } });
  assert.equal(plan.insidePages, 96);
  assert.equal(plan.pages, 96);
  assert.equal(plan.pad, 0);
  assert.equal(plan.signatures.length, 6);
  assert.equal(plan.sheetCount, 24); // 96 / 4
  // Inside page 0 is file page 2 (index 1): the cover is not inside.
  assert.equal(plan.order[0], 1);
  // Signature 1 sheet 1 front = [16, 1] (1-based) | signature 2 starts at 17.
  assert.deepEqual(plan.sheetsInfo[0].front, [15, 0]);
  assert.deepEqual(plan.sheetsInfo[4].front, [31, 16]);
  assert.equal(plan.sheetsInfo[4].signature, 1);
  // Spine: 48 leaves of 80 gsm (0.1 mm) + cover
  assert.ok(plan.spine > 4.5 && plan.spine < 6, `spine ${plan.spine}`);
  assert.ok(plan.cover.enabled && plan.cover.layout && plan.cover.layout.count >= 1);
  assert.ok(Math.abs(plan.cover.w - (2 * 148 + plan.spine)) < 0.01);
});

test('perfect bound: grinding moves pages away from the spine', async () => {
  const g = await readPdfGeometry(await sample('book-a5-98-pages.pdf'));
  const plan = planPerfectBound({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'SRA3' }, printer, book: { grind: 3, creep: 'off' } });
  assert.equal(plan.shiftFor(0), -3);
  assert.ok(Math.abs(plan.spread.w - 2 * 151) < 0.01);
});

test('perfect bound: inside PDF and cover PDF build', async () => {
  const bytes = await sample('book-a5-98-pages.pdf');
  const g = await readPdfGeometry(bytes);
  const plan = planPerfectBound({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A3' }, printer, book: { spineText: 'MY BOOK' } });
  const inside = await buildBookInsidePdf({ sourceBytes: bytes, plan });
  assert.equal((await readPdfGeometry(inside)).pageCount, plan.pdfPages);
  const cover = await buildCoverPdf({ sourceBytes: bytes, plan });
  assert.equal((await readPdfGeometry(cover)).pageCount, 1);
  const ids = getPerfectBoundWarnings({ plan }).map((n) => n.id);
  assert.ok(ids.includes('signatures') && ids.includes('book-print'));
});

test('perfect bound: a thin book gets the thin-spine note', async () => {
  const g = await readPdfGeometry(await sample('booklet-a5-10-pages.pdf'));
  const plan = planPerfectBound({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A3' }, printer });
  assert.equal(plan.insidePages, 8);
  assert.ok(getPerfectBoundWarnings({ plan }).some((n) => n.id === 'thin-spine'));
});
