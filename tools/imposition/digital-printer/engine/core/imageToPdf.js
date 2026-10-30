// Turns pictures (JPG / PNG) into a PDF so every tool can work with them.
// Pictures don't reliably store a print size, so we work one out:
//   1. a real print resolution saved in the file (150 dpi or more), or
//   2. the picture has the exact shape of a standard size (e.g. a business card), or
//   3. assume 300 dpi.

import { PDFDocument } from 'pdf-lib';
import { mmToPt } from './units.js';
import { STANDARD_SIZES } from './sizes.js';

// What kind of file is this? Looks at the first bytes, not the file name.
export function sniffFormat(b) {
  if (!b || b.length < 12) return 'unknown';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
  }
  const head = ascii(b, 0, Math.min(1024, b.length));
  if (head.includes('%PDF')) return 'pdf';
  return 'unknown';
}

// Print resolution stored in the file (dpi), or null.
export function readImageDpi(bytes, format) {
  try {
    if (format === 'png') return readPngDpi(bytes);
    if (format === 'jpg') return readJpegInfo(bytes).dpi;
  } catch {
    // Damaged metadata: just ignore it.
  }
  return null;
}

// EXIF orientation of a JPEG (1 = upright). Phone photos are often stored sideways.
export function readJpegOrientation(bytes) {
  try {
    return readJpegInfo(bytes).orientation;
  } catch {
    return 1;
  }
}

// Works out the print size of a picture in mm.
export function guessImageSize(px, dpiMeta) {
  if (dpiMeta && dpiMeta >= 150 && dpiMeta <= 2400) {
    return { w: (px.w / dpiMeta) * 25.4, h: (px.h / dpiMeta) * 25.4, source: 'metadata', name: null };
  }

  const ratio = px.w / px.h;
  const landscape = px.w >= px.h;
  let best = null;
  for (const z of STANDARD_SIZES) {
    for (const bleed of [0, 3]) {
      const W = (landscape ? z.long : z.short) + 2 * bleed;
      const H = (landscape ? z.short : z.long) + 2 * bleed;
      // Very strict: a designer export matches within 0.1%; ordinary photos (3:2, 4:3, 16:9) must not match.
      if (Math.abs(W / H / ratio - 1) > 0.0025) continue;
      const dpi = px.w / (W / 25.4);
      if (dpi < 100 || dpi > 1200) continue;
      const score = Math.abs(Math.log(dpi / 300)) + (bleed ? 0.01 : 0);
      if (!best || score < best.score) best = { w: W, h: H, score, name: z.name };
    }
  }
  if (best) return { w: best.w, h: best.h, source: 'standard', name: best.name };

  return { w: (px.w / 300) * 25.4, h: (px.h / 300) * 25.4, source: 'default', name: null };
}

/**
 * items: [{ bytes: Uint8Array, format: 'jpg' | 'png', name, dpi? }]
 * returns { bytes (PDF), info: [{ name, format, px, dpiMeta, sizeSource, sizeName }] }
 */
export async function imagesToPdf(items) {
  const doc = await PDFDocument.create();
  doc.setCreator('PrintHub');
  doc.setProducer('PrintHub');
  const info = [];

  for (const it of items) {
    let img;
    try {
      img = it.format === 'jpg' ? await doc.embedJpg(it.bytes) : await doc.embedPng(it.bytes);
    } catch {
      throw new Error(`"${it.name}" could not be read. Try saving it again as JPG or PNG.`);
    }
    const px = { w: img.width, h: img.height };
    const dpiMeta = it.dpi ?? readImageDpi(it.bytes, it.format);
    const size = guessImageSize(px, dpiMeta);
    const W = mmToPt(size.w);
    const H = mmToPt(size.h);
    const page = doc.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
    info.push({ name: it.name, format: it.format, px, dpiMeta, sizeSource: size.source, sizeName: size.name });
  }

  return { bytes: await doc.save(), info };
}

// ---------- file format details ----------

function ascii(b, start, len) {
  let s = '';
  for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function readPngDpi(b) {
  let i = 8;
  while (i + 8 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = ascii(b, i + 4, 4);
    if (type === 'pHYs' && len >= 9) {
      const d = i + 8;
      const ppuX = ((b[d] << 24) | (b[d + 1] << 16) | (b[d + 2] << 8) | b[d + 3]) >>> 0;
      return b[d + 8] === 1 ? Math.round(ppuX * 0.0254) : null; // unit 1 = pixels per metre
    }
    if (type === 'IDAT' || type === 'IEND') break;
    i += 12 + len;
  }
  return null;
}

function readJpegInfo(b) {
  let dpi = null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // end / start of image data
    const len = (b[i + 2] << 8) | b[i + 3];
    const start = i + 4;

    if (marker === 0xe0 && ascii(b, start, 5) === 'JFIF\0') {
      const units = b[start + 7];
      const x = (b[start + 8] << 8) | b[start + 9];
      if (dpi == null && x > 1) {
        if (units === 1) dpi = x;
        else if (units === 2) dpi = Math.round(x * 2.54);
      }
    }

    if (marker === 0xe1 && ascii(b, start, 6) === 'Exif\0\0') {
      const exif = readExif(b, start + 6);
      orientation = exif.orientation || 1;
      if (exif.dpi) dpi = exif.dpi;
    }

    i += 2 + len;
  }
  return { dpi, orientation };
}

function readExif(b, t) {
  const le = b[t] === 0x49; // 'II' = little endian
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) =>
    (le
      ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
      : (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  const ifd = t + u32(t + 4);
  const count = u16(ifd);
  let orientation = 1;
  let xres = null;
  let unit = 2; // 2 = inch, 3 = cm
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > b.length) break;
    const tag = u16(e);
    if (tag === 0x0112) orientation = u16(e + 8);
    else if (tag === 0x0128) unit = u16(e + 8);
    else if (tag === 0x011a) {
      const off = t + u32(e + 8);
      const num = u32(off);
      const den = u32(off + 4);
      if (den) xres = num / den;
    }
  }
  const dpi = xres ? Math.round(unit === 3 ? xres * 2.54 : xres) : null;
  return { orientation, dpi };
}
