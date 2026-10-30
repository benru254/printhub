// Engine tests. Run: npm test
// These check the maths that customers will trust (how many per sheet, bleed, sizes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  computeStepRepeat, fitCount, readPdfGeometry, resolveSettings, CARD_DEFAULTS,
  detectProduct, cropMarks, buildCardsPdf, getSheet, orientSheet, planCards,
  getCardWarnings, computeArtFit, matchStandard, makeCustomSheet, sniffFormat,
  readImageDpi, guessImageSize, imagesToPdf, pageRanges, countsBySheet, SHEET_ORDER,
} from '../index.js';

const A3 = getSheet('A3');
const sample = (name) => readFile(new URL(`../../samples/${name}`, import.meta.url));

// ---------- layout maths ----------

test('fitCount basics', () => {
  assert.equal(fitCount(100, 50, 0), 2);
  assert.equal(fitCount(103, 50, 3), 2);
  assert.equal(fitCount(102, 50, 3), 1);
  assert.equal(fitCount(10, 50, 3), 0);
});

test('85x50 on A3: theoretical max is 24', () => {
  const l = computeStepRepeat({ sheetW: A3.w, sheetH: A3.h, itemW: 85, itemH: 50, margin: 0, gap: 0, bleed: 0, marks: false, allowRotate: true });
  assert.equal(l.count, 24);
});

test('85x50 on A3 with 5 mm margin, 3 mm gap, marks = 21', () => {
  const l = computeStepRepeat({ sheetW: A3.w, sheetH: A3.h, itemW: 85, itemH: 50, margin: 5, gap: 3, bleed: 0, marks: true, allowRotate: true });
  assert.equal(l.count, 21);
});

test('slots and marks stay inside the printable area', () => {
  const l = computeStepRepeat({ sheetW: A3.w, sheetH: A3.h, itemW: 85, itemH: 50, margin: 5, gap: 6, bleed: 3, marks: true, allowRotate: true });
  for (const s of l.slots) {
    assert.ok(s.x - 3 >= 5 && s.y - 3 >= 5);
    assert.ok(s.x + s.w + 3 <= A3.w - 5 && s.y + s.h + 3 <= A3.h - 5);
  }
  for (const m of cropMarks(l)) {
    for (const v of [m.x1, m.x2]) assert.ok(v >= 5 - 1e-9 && v <= A3.w - 5 + 1e-9);
    for (const v of [m.y1, m.y2]) assert.ok(v >= 5 - 1e-9 && v <= A3.h - 5 + 1e-9);
  }
});

test('landscape sheet is turned, same count when rotation is allowed', () => {
  const land = orientSheet(A3, 'landscape');
  assert.equal(land.w, 420);
  assert.equal(land.h, 297);
  const args = { itemW: 85, itemH: 50, margin: 5, gap: 3, bleed: 0, marks: true, allowRotate: true };
  const p = computeStepRepeat({ sheetW: A3.w, sheetH: A3.h, ...args }).count;
  const l = computeStepRepeat({ sheetW: land.w, sheetH: land.h, ...args }).count;
  assert.equal(p, l);
});

// ---------- sizes & detection ----------

test('recognises standard sizes', () => {
  assert.equal(matchStandard(85, 55).id, 'card-85x55');
  assert.equal(matchStandard(210, 148).id, 'A5');
  assert.equal(matchStandard(100, 70), null);
  assert.equal(detectProduct({ w: 85, h: 50 }).kind, 'business-card');
  assert.equal(detectProduct({ w: 148, h: 210 }, 1).label, 'A5 flyers');
  assert.equal(detectProduct({ w: 210, h: 297 }, 8).recommended, 'booklet');
  assert.equal(detectProduct({ w: 48, h: 35 }).kind, 'small-item');
});

test('custom sheet validation', () => {
  const s = makeCustomSheet({ label: 'My 13x19', w: 483, h: 330 });
  assert.equal(s.w, 330);
  assert.equal(s.h, 483);
  assert.throws(() => makeCustomSheet({ w: 5, h: 300 }));
});

test('page ranges for people', () => {
  assert.equal(pageRanges([0, 1, 2, 4]), '1–3, 5');
  assert.equal(pageRanges([3]), '4');
});

// ---------- reading files ----------

test('reads a 91x56 file as 85x50 + 3 mm bleed (guess)', async () => {
  const g = await readPdfGeometry(await sample('card-85x50-bleed-front-back.pdf'));
  assert.equal(g.pageCount, 2);
  assert.deepEqual(g.pages[0].trimMm, { w: 85, h: 50 });
  assert.equal(g.pages[0].bleedMm, 3);
  assert.equal(g.pages[0].source, 'guess');
});

test('reads an A5 + 3 mm bleed flyer', async () => {
  const g = await readPdfGeometry(await sample('flyer-a5-bleed.pdf'));
  assert.deepEqual(g.pages[0].trimMm, { w: 148, h: 210 });
  assert.equal(g.pages[0].bleedMm, 3);
});

test('reads TrimBox + BleedBox exactly', async () => {
  const g = await readPdfGeometry(await sample('card-85x55-trimbox.pdf'));
  assert.deepEqual(g.pages[0].trimMm, { w: 85, h: 55 });
  assert.equal(g.pages[0].bleedMm, 3);
  assert.equal(g.pages[0].source, 'trimbox');
});

test('an exact A4 page is not mistaken for something + bleed', async () => {
  const g = await readPdfGeometry(await sample('document-a4-8-pages.pdf'));
  assert.deepEqual(g.pages[0].trimMm, { w: 210, h: 297 });
  assert.equal(g.pages[0].bleedMm, 0);
  assert.equal(g.sizeGroups.length, 1);
});

// ---------- pictures ----------

test('sniffs file types', async () => {
  assert.equal(sniffFormat(await sample('picture-card-front.png')), 'png');
  assert.equal(sniffFormat(await sample('sticker-60x60.pdf')), 'pdf');
});

test('picture with 300 dpi stored = 85 x 55 mm', async () => {
  const bytes = await sample('picture-card-front.png');
  assert.equal(readImageDpi(bytes, 'png'), 300);
  const { bytes: pdf, info } = await imagesToPdf([{ bytes, format: 'png', name: 'front' }]);
  assert.equal(info[0].sizeSource, 'metadata');
  const g = await readPdfGeometry(pdf);
  assert.deepEqual(g.pages[0].trimMm, { w: 85, h: 55 });
});

test('picture without print size: exact card shape -> card size, otherwise 300 dpi', () => {
  const card = guessImageSize({ w: 2008, h: 1300 }, 72);
  assert.equal(card.source, 'standard');
  assert.equal(Math.round(card.w), 85);
  const other = guessImageSize({ w: 1280, h: 800 }, null);
  assert.equal(other.source, 'default');
  assert.equal(Math.round(other.w * 10) / 10, 108.4);
});

// ---------- fitting a design to a new size ----------

test('fill / fit / stretch maths', () => {
  const fill = computeArtFit({ srcW: 100, srcH: 50, outW: 50, outH: 50, mode: 'fill' });
  assert.equal(fill.scale, 1);
  assert.equal(fill.cropW, 50);
  const fit = computeArtFit({ srcW: 100, srcH: 50, outW: 50, outH: 50, mode: 'fit' });
  assert.equal(fit.scale, 0.5);
  assert.equal(fit.padH, 25);
  assert.equal(fit.maxBleed, 0);
  const st = computeArtFit({ srcW: 100, srcH: 50, outW: 50, outH: 50, mode: 'stretch' });
  assert.equal(st.distortion, 0.5);
});

test('bleed available scales with the design', () => {
  const same = computeArtFit({ srcW: 85, srcH: 55, srcBleed: 3, outW: 85, outH: 55 });
  assert.equal(same.maxBleed, 3);
  const half = computeArtFit({ srcW: 170, srcH: 110, srcBleed: 3, outW: 85, outH: 55 });
  assert.equal(half.maxBleed, 1.5);
});

// ---------- settings & plan ----------

test('auto gap follows bleed, manual values win, bleed limited to what exists', () => {
  assert.equal(resolveSettings(CARD_DEFAULTS, {}, { availBleed: 3 }).gap, 6);
  assert.equal(resolveSettings(CARD_DEFAULTS, { bleed: 0 }, { availBleed: 3 }).gap, 3);
  assert.equal(resolveSettings(CARD_DEFAULTS, { gap: 4 }, { availBleed: 3 }).gap, 4);
  const s = resolveSettings(CARD_DEFAULTS, { bleed: 5 }, { availBleed: 2 });
  assert.equal(s.bleedUsed, 2);
});

test('plan: resized picture to 85 x 55 business card', async () => {
  const bytes = await sample('picture-whatsapp.png');
  const { bytes: pdf, info } = await imagesToPdf([{ bytes, format: 'png', name: 'wa' }]);
  const g = await readPdfGeometry(pdf);
  const plan = planCards({ geometry: g, base: { ...CARD_DEFAULTS, size: { w: 85, h: 55 } } });
  assert.equal(plan.resized, true);
  assert.equal(plan.layout.count, 18); // 85 x 55 (not 85 x 50) fits 18 on A3
  const notes = getCardWarnings({ plan, geometry: g, imageInfo: info }).map((n) => n.id);
  assert.ok(notes.includes('fill-crop'));
  const counts = countsBySheet(plan, SHEET_ORDER, [], 'portrait');
  assert.equal(counts.A3, 18);
});

test('item too big returns 0 with a warning', async () => {
  const g = await readPdfGeometry(await sample('flyer-a5-bleed.pdf'));
  const plan = planCards({ geometry: g, base: { ...CARD_DEFAULTS, sheet: 'A6' } });
  assert.equal(plan.layout.count, 0);
  assert.ok(getCardWarnings({ plan, geometry: g }).find((x) => x.id === 'too-big'));
});

test('builds a 2-page (front/back) A3 PDF', async () => {
  const bytes = await sample('card-85x50-bleed-front-back.pdf');
  const g = await readPdfGeometry(bytes);
  const plan = planCards({ geometry: g, base: CARD_DEFAULTS });
  assert.equal(plan.layout.count, 21);
  const out = await buildCardsPdf({ sourceBytes: bytes, plan });
  const back = await readPdfGeometry(out);
  assert.equal(back.pageCount, 2);
  assert.deepEqual(back.pages[0].trimMm, { w: 297, h: 420 });
});
