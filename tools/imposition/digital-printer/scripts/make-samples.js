// Creates test files in /samples so you can try the app without real customer files.
// Run: npm run samples

import { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFNumber } from 'pdf-lib';
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { mmToPt } from '../engine/core/units.js';

const outDir = new URL('../samples/', import.meta.url);
await mkdir(outDir, { recursive: true });

// ---- PDFs ----
// 85 x 50 card WITH 3 mm bleed (page is 91 x 56, no TrimBox: like many phone/Canva exports).
await save('card-85x50-bleed-front-back.pdf', await card({ w: 85, h: 50, bleed: 3, trimBox: false, sides: 2 }));
// 85 x 55 card with a proper TrimBox + BleedBox (like InDesign / Illustrator exports).
await save('card-85x55-trimbox.pdf', await card({ w: 85, h: 55, bleed: 3, trimBox: true, sides: 1 }));
// 90 x 50 card with NO bleed.
await save('card-90x50-no-bleed.pdf', await card({ w: 90, h: 50, bleed: 0, trimBox: false, sides: 1 }));
// 60 x 60 sticker, no bleed.
await save('sticker-60x60.pdf', await card({ w: 60, h: 60, bleed: 0, trimBox: false, sides: 1 }));
// A5 flyer with 3 mm bleed (page 154 x 216, no TrimBox).
await save('flyer-a5-bleed.pdf', await card({ w: 148, h: 210, bleed: 3, trimBox: false, sides: 1 }));
// 8-page A4 document (for page thumbnails and the booklet suggestion).
await save('document-a4-8-pages.pdf', await documentPdf(8));

// A6 receipt design (white edges, space at the top right for the number).
await save('receipt-a6.pdf', await receipt());
// 12 different tickets, one per page (for "Pages in order").
await save('tickets-12-pages.pdf', await tickets(12));

// 10-page A5 booklet with 3 mm bleed (not a multiple of 4: 2 blank pages get added).
await save('booklet-a5-10-pages.pdf', await bookletPdf(10));

// ---- Pictures ----
// Front + back business card pictures saved at 300 dpi (85 x 55 mm = 1004 x 650 px).
await save('picture-card-front.png', png(1004, 650, cardPixels([20, 110, 180]), 300));
await save('picture-card-back.png', png(1004, 650, cardPixels([215, 90, 30]), 300));
// A picture with no print size stored (like a WhatsApp image).
await save('picture-whatsapp.png', png(1280, 800, cardPixels([40, 140, 70]), null));

async function card({ w, h, bleed, trimBox, sides }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let s = 0; s < sides; s++) {
    const W = mmToPt(w + 2 * bleed);
    const H = mmToPt(h + 2 * bleed);
    const page = doc.addPage([W, H]);
    const b = mmToPt(bleed);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: s === 0 ? rgb(0.05, 0.45, 0.7) : rgb(0.85, 0.35, 0.1) });
    page.drawRectangle({ x: b, y: b, width: W - 2 * b, height: H - 2 * b, borderColor: rgb(1, 1, 1), borderWidth: 0.5 });
    page.drawText(s === 0 ? 'FRONT' : 'BACK', { x: b + 8, y: b + 8, size: 14, font, color: rgb(1, 1, 1) });
    page.drawText(`${w} x ${h}`, { x: b + 8, y: b + 26, size: 9, font, color: rgb(1, 1, 1) });
    page.drawText('TOP ^', { x: W / 2 - 18, y: H - b - 16, size: 10, font, color: rgb(1, 1, 0.4) });
    if (trimBox) {
      page.node.set(PDFName.of('TrimBox'), box(doc, b, b, W - b, H - b));
      page.node.set(PDFName.of('BleedBox'), box(doc, 0, 0, W, H));
    }
  }
  return doc.save();
}

async function documentPdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([mmToPt(210), mmToPt(297)]);
    page.drawRectangle({ x: 30, y: 30, width: page.getWidth() - 60, height: 60, color: rgb(0.1, 0.4, 0.6) });
    page.drawText(String(i), { x: page.getWidth() / 2 - 40, y: page.getHeight() / 2 - 40, size: 120, font, color: rgb(0.15, 0.15, 0.15) });
    page.drawText(`Page ${i} of ${pages}`, { x: 40, y: page.getHeight() - 60, size: 18, font, color: rgb(0.3, 0.3, 0.3) });
  }
  return doc.save();
}

async function receipt() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const thin = await doc.embedFont(StandardFonts.Helvetica);
  const W = mmToPt(105);
  const H = mmToPt(148);
  const page = doc.addPage([W, H]);
  const m = mmToPt(6);
  page.drawText('PROFUEL GAS', { x: m, y: H - m - 14, size: 16, font, color: rgb(0.05, 0.35, 0.2) });
  page.drawText('CASH SALE RECEIPT', { x: m, y: H - m - 30, size: 9, font: thin, color: rgb(0.2, 0.2, 0.2) });
  let y = H - mmToPt(40);
  for (const label of ['Date:', 'Name:', 'Item', 'Qty', 'Amount (KES)']) {
    page.drawText(label, { x: m, y, size: 9, font: thin, color: rgb(0.2, 0.2, 0.2) });
    page.drawLine({ start: { x: m + 60, y: y - 2 }, end: { x: W - m, y: y - 2 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= mmToPt(12);
  }
  page.drawText('Signature: ________________', { x: m, y: m + 6, size: 9, font: thin, color: rgb(0.2, 0.2, 0.2) });
  return doc.save();
}

async function tickets(n) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([mmToPt(100), mmToPt(50)]);
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(0.98, 0.92, 0.75) });
    page.drawText(`TICKET ${i}`, { x: 30, y: 60, size: 28, font, color: rgb(0.5, 0.1, 0.1) });
  }
  return doc.save();
}

async function bookletPdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const b = mmToPt(3);
  for (let i = 1; i <= pages; i++) {
    const W = mmToPt(148) + 2 * b;
    const H = mmToPt(210) + 2 * b;
    const page = doc.addPage([W, H]);
    const cover = i === 1 || i === pages;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: cover ? rgb(0.1, 0.35, 0.6) : rgb(0.97, 0.97, 0.94) });
    page.drawText(i === 1 ? 'FRONT COVER' : i === pages ? 'BACK COVER' : `Page ${i}`, { x: b + 30, y: H - b - 60, size: 18, font, color: cover ? rgb(1, 1, 1) : rgb(0.2, 0.2, 0.2) });
    page.drawText(String(i), { x: W / 2 - 30, y: H / 2 - 40, size: 90, font, color: cover ? rgb(1, 1, 1) : rgb(0.75, 0.75, 0.75) });
    page.node.set(PDFName.of('TrimBox'), box(doc, b, b, W - b, H - b));
    page.node.set(PDFName.of('BleedBox'), box(doc, 0, 0, W, H));
  }
  return doc.save();
}

function box(doc, x1, y1, x2, y2) {
  const a = PDFArray.withContext(doc.context);
  [x1, y1, x2, y2].forEach((n) => a.push(PDFNumber.of(n)));
  return a;
}

// Simple card-like picture: coloured background, yellow band at the TOP, white block on the left.
function cardPixels(bg) {
  return (x, y, w, h) => {
    if (y < h * 0.14) return [250, 210, 40];
    if (x > w * 0.06 && x < w * 0.32 && y > h * 0.3 && y < h * 0.8) return [255, 255, 255];
    return bg;
  };
}

// Minimal PNG writer (RGB, optional print resolution).
function png(w, h, pixel, dpi) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y, w, h);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  if (dpi) {
    const phys = Buffer.alloc(9);
    const ppm = Math.round(dpi / 0.0254);
    phys.writeUInt32BE(ppm, 0);
    phys.writeUInt32BE(ppm, 4);
    phys[8] = 1;
    parts.push(chunk('pHYs', phys));
  }
  parts.push(chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

async function save(name, bytes) {
  await writeFile(new URL(name, outDir), bytes);
  console.log('created samples/' + name);
}
