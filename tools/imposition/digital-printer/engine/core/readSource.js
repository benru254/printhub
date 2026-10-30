// Reads the customer's PDF and works out, for each page:
//   - the finished (trim) size in mm
//   - how much bleed the file has
//   - where the trim box sits inside the PDF (in points), for building the output
// Uses pdf-lib, so it runs the same in the browser and later on the server.

import { PDFDocument, PDFName } from 'pdf-lib';
import { ptToMm, round1 } from './units.js';
import { matchStandard } from './sizes.js';

const MAX_BLEED_MM = 5; // anything bigger is usually crop marks / slug, not bleed
const BLEED_GUESSES = [3, 2, 5];

export async function readPdfGeometry(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (String(err && err.message).toLowerCase().includes('encrypt')) {
      throw new Error('This PDF is password-protected or locked. Save an unlocked copy and try again.');
    }
    throw new Error('This file could not be read as a PDF. It may be damaged.');
  }

  const pages = doc.getPages().map((page, index) => readPage(page, index));
  if (!pages.length) throw new Error('This PDF has no pages.');
  return { pageCount: pages.length, pages, sizeGroups: groupSizes(pages) };
}

function readPage(page, index) {
  const node = page.node;
  const media = page.getMediaBox();
  const crop = node.get(PDFName.of('CropBox')) ? page.getCropBox() : media;
  const hasTrim = !!node.get(PDFName.of('TrimBox'));
  const hasBleed = !!node.get(PDFName.of('BleedBox'));
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;

  let trim = crop;
  let bleedMm = 0;
  let source = 'page';

  if (hasTrim) {
    // Best case: the file tells us exactly where the cut goes.
    trim = page.getTrimBox();
    const outer = hasBleed ? page.getBleedBox() : crop;
    const sides = [
      trim.x - outer.x,
      trim.y - outer.y,
      outer.x + outer.width - (trim.x + trim.width),
      outer.y + outer.height - (trim.y + trim.height),
    ].map(ptToMm);
    bleedMm = Math.max(0, Math.min(...sides, MAX_BLEED_MM));
    source = 'trimbox';
  } else {
    // No trim box. If the page is not a standard size, check if it is a
    // standard size PLUS bleed (e.g. 91 x 56 = 85 x 50 card + 3 mm, 154 x 216 = A5 + 3 mm).
    const w = ptToMm(crop.width);
    const h = ptToMm(crop.height);
    if (!matchStandard(w, h, 0.6)) {
      for (const b of BLEED_GUESSES) {
        if (matchStandard(w - 2 * b, h - 2 * b, 0.6)) {
          const inset = (b * 72) / 25.4;
          trim = {
            x: crop.x + inset,
            y: crop.y + inset,
            width: crop.width - 2 * inset,
            height: crop.height - 2 * inset,
          };
          bleedMm = b;
          source = 'guess';
          break;
        }
      }
    }
  }

  return {
    index,
    rotation,
    source, // 'trimbox' | 'guess' | 'page'
    trimMm: { w: round1(ptToMm(trim.width)), h: round1(ptToMm(trim.height)) },
    bleedMm: round1(bleedMm),
    trimBoxPt: { x: trim.x, y: trim.y, width: trim.width, height: trim.height },
  };
}

// Groups pages that share the same finished size: [{ w, h, pages: [0, 1] }]
export function groupSizes(pages) {
  const groups = [];
  for (const p of pages) {
    const g = groups.find((x) => Math.abs(x.w - p.trimMm.w) < 0.6 && Math.abs(x.h - p.trimMm.h) < 0.6);
    if (g) g.pages.push(p.index);
    else groups.push({ w: p.trimMm.w, h: p.trimMm.h, pages: [p.index] });
  }
  return groups;
}

// [0,1,2,4] -> "1–3, 5"  (page numbers for people, starting at 1)
export function pageRanges(indices) {
  const nums = indices.map((i) => i + 1).sort((a, b) => a - b);
  const parts = [];
  let start = nums[0];
  let prev = nums[0];
  for (let k = 1; k <= nums.length; k++) {
    const n = nums[k];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(', ');
}
