// Part 4 tests: Make bleed. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import {
  fillBleed, edgeInk, readPdfGeometry, planCards, CARD_DEFAULTS, buildCardsPdf,
  getCardWarnings, cardStartState, makeSavedDefault, normalizePrinter, SHEET_ORDER,
} from '../index.js';

const sample = (name) => readFile(new URL(`../../samples/${name}`, import.meta.url));

// Tiny picture helper: width x height RGBA, filled by paint(x, y) -> [r, g, b]
function pixels(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const p = (y * width + x) * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  return data;
}
const at = (data, width, x, y) => {
  const p = (y * width + x) * 4;
  return [data[p], data[p + 1], data[p + 2]];
};

test('mirror: the bleed is a reflection of the edge of the design', () => {
  // 10 x 6 picture with a 2 px empty border; inner column x=2 is red, x=3 is green.
  const W = 10, H = 6, pad = 2;
  const data = pixels(W, H, (x, y) => {
    if (x < pad || y < pad || x >= W - pad || y >= H - pad) return [0, 0, 0];
    if (x === 2) return [255, 0, 0];
    if (x === 3) return [0, 255, 0];
    return [0, 0, 255];
  });
  fillBleed(data, W, H, pad, 'mirror');
  assert.deepEqual(at(data, W, 1, 3), [255, 0, 0]); // next to the edge = the edge column
  assert.deepEqual(at(data, W, 0, 3), [0, 255, 0]); // further out = the next column in
  assert.deepEqual(at(data, W, 0, 0), [0, 255, 0]); // corner mirrored both ways
});

test('stretch: the bleed repeats the edge colour', () => {
  const W = 10, H = 6, pad = 2;
  const data = pixels(W, H, (x, y) => {
    if (x < pad || y < pad || x >= W - pad || y >= H - pad) return [0, 0, 0];
    return x === 2 ? [255, 0, 0] : [0, 0, 255];
  });
  fillBleed(data, W, H, pad, 'stretch');
  assert.deepEqual(at(data, W, 0, 3), [255, 0, 0]);
  assert.deepEqual(at(data, W, 9, 3), [0, 0, 255]);
});

test('edge ink: coloured edges vs white edges', () => {
  const blue = edgeInk({ data: pixels(200, 120, () => [20, 110, 180]), width: 200, height: 120, pxPerMm: 4 });
  assert.equal(blue.touches, true);
  const white = edgeInk({
    data: pixels(200, 120, (x, y) => (x > 30 && x < 170 && y > 30 && y < 90 ? [0, 0, 0] : [255, 255, 255])),
    width: 200, height: 120, pxPerMm: 4,
  });
  assert.equal(white.touches, false);
});

test('auto makes bleed only when needed and colour touches the edge', async () => {
  const g = await readPdfGeometry(await sample('card-90x50-no-bleed.pdf'));
  const plain = planCards({ geometry: g, base: CARD_DEFAULTS, inkTouches: false });
  assert.equal(plain.madeBleed, null);
  assert.equal(plain.settings.bleedUsed, 0);

  const coloured = planCards({ geometry: g, base: CARD_DEFAULTS, inkTouches: true });
  assert.equal(coloured.madeBleed, 'mirror');
  assert.equal(coloured.settings.bleedUsed, 3);
  assert.equal(coloured.settings.gap, 6); // pieces now sit bleed-to-bleed

  const off = planCards({ geometry: g, base: { ...CARD_DEFAULTS, makeBleed: 'off' }, inkTouches: true });
  assert.equal(off.madeBleed, null);
  assert.ok(getCardWarnings({ plan: off, geometry: g }).some((n) => n.id === 'no-bleed-ink'));

  const stretch = planCards({ geometry: g, base: { ...CARD_DEFAULTS, makeBleed: 'stretch' } });
  assert.equal(stretch.madeBleed, 'stretch');
  assert.ok(getCardWarnings({ plan: stretch, geometry: g }).some((n) => n.id === 'bleed-made'));
});

test('a file that already has bleed never gets made bleed', async () => {
  const g = await readPdfGeometry(await sample('card-85x50-bleed-front-back.pdf'));
  const plan = planCards({ geometry: g, base: { ...CARD_DEFAULTS, makeBleed: 'mirror' }, inkTouches: true });
  assert.equal(plan.madeBleed, null);
  assert.equal(plan.needsBleed, false);
});

test('builds a PDF with made bleed under the real design', async () => {
  const bytes = await sample('card-90x50-no-bleed.pdf');
  const g = await readPdfGeometry(bytes);
  const plan = planCards({ geometry: g, base: CARD_DEFAULTS, inkTouches: true });
  // A small solid PNG stands in for the bleed picture the app makes.
  const png = tinyPng(96, 56, [20, 110, 180]);
  await assert.rejects(() => buildCardsPdf({ sourceBytes: bytes, plan }));
  const out = await buildCardsPdf({ sourceBytes: bytes, plan, bleedArt: [{ bytes: png, format: 'png' }] });
  assert.ok(out.length > 1000);
});

test('make bleed choice is saved with "my default"', () => {
  const printer = normalizePrinter({}, SHEET_ORDER);
  const saved = makeSavedDefault({ ...CARD_DEFAULTS, makeBleed: 'stretch' }, {});
  assert.equal(cardStartState(printer, saved).base.makeBleed, 'stretch');
});

function tinyPng(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    let c = ~0;
    for (const byte of td) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    const crc = Buffer.alloc(4); crc.writeUInt32BE(~c >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
