// Checks a customer's file against the product they picked, in plain words.
// It never blocks an order: the operator fixes what needs fixing and sends a proof.
// It answers three things a customer worries about: is it the right size, is it sharp
// enough, and does it have the pages I chose.

import { sizeText } from './catalogue.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Print resolution of a picture at the finished size (the picture is fitted to fill it).
export function dpiAtSize(px, w, h) {
  if (!px || !px.w || !px.h) return null;
  // Use the picture the way round that matches the finished shape.
  const pw = Math.max(px.w, px.h); // long side of the picture on the long side of the print
  const ph = Math.min(px.w, px.h);
  // Filled to cover the size: the side that is stretched most decides.
  return Math.round(Math.min(pw / (Math.max(w, h) / 25.4), ph / (Math.min(w, h) / 25.4)));
}

/**
 * product, choice: from the catalogue.  geometry: readPdfGeometry of the file.
 * imageInfo: set when the customer chose pictures instead of a PDF.
 * Returns { level: 'good' | 'check' | 'low', lines: [{ level, text }], suggest: { sides?, pages? } }
 *   good  = nothing to do      check = the shop adjusts it and shows a proof
 *   low   = the picture is too small to print sharp at this size
 */
export function checkArtwork({ product, choice, geometry, imageInfo = null }) {
  const lines = [];
  const suggest = {};
  const page = geometry.pages[0];
  const fw = page.trimMm.w;
  const fh = page.trimMm.h;
  const { w, h } = choice;
  const area = product.kind === 'area';
  const name = sizeText(w, h);

  // ---- size and shape ----
  const tol = area ? Math.max(w, h) * 0.01 : 2;
  const sameSize = (near(fw, w, tol) && near(fh, h, tol)) || (near(fw, h, tol) && near(fh, w, tol));
  const ratioFile = Math.max(fw, fh) / Math.min(fw, fh);
  const ratioWant = Math.max(w, h) / Math.min(w, h);
  const sameShape = Math.abs(ratioFile / ratioWant - 1) <= 0.03;
  if (sameSize) lines.push({ level: 'good', text: `Your design is the right size (${name}).` });
  else if (sameShape) lines.push({ level: 'good', text: `Right shape. We resize it to ${name} for you.` });
  else lines.push({ level: 'check', text: `Your design has a different shape from ${name}. We fit it and send you a picture to approve before printing.` });

  // ---- sharpness (pictures only: a PDF from a design program is normally sharp) ----
  if (imageInfo && imageInfo[0] && imageInfo[0].px) {
    const dpi = dpiAtSize(imageInfo[0].px, w, h);
    const long = Math.max(w, h);
    const need = !area ? { good: 220, ok: 150 } : long >= 1500 ? { good: 60, ok: 30 } : long >= 600 ? { good: 100, ok: 60 } : { good: 180, ok: 120 };
    if (dpi >= need.good) lines.push({ level: 'good', text: 'The picture is sharp enough for this size.' });
    else if (dpi >= need.ok) lines.push({ level: 'check', text: area ? 'The picture will look fine from a few steps away, a little soft up close.' : 'The picture may look slightly soft. A bigger original would be sharper.' });
    else lines.push({ level: 'low', text: `The picture is too small for ${name}: it will look blurry. Send the original design file if you have it, or tell us in the notes.` });
  }

  // ---- pages ----
  const pages = geometry.pageCount;
  if (product.kind === 'sheet') {
    const offersBoth = (product.sides || []).includes(2);
    if (pages >= 2 && choice.sides === 1 && offersBoth) {
      suggest.sides = 2;
      lines.push({ level: 'check', text: 'Your file has a front and a back, so we set it to print both sides.' });
    } else if (pages === 1 && choice.sides === 2) {
      lines.push({ level: 'check', text: 'You chose both sides but the file has one page. Tell us in the notes what goes on the back, or it stays blank.' });
    } else if (pages > 2) {
      lines.push({ level: 'check', text: `Your file has ${pages} pages. We print the first ${choice.sides === 2 ? 'two (front and back)' : 'one'}. Say in the notes if you want something else.` });
    }
  } else if (product.kind === 'booklet') {
    suggest.pages = pages;
    lines.push({ level: 'good', text: `Your file has ${pages} pages.` });
  } else if (pages > 1) {
    lines.push({ level: 'check', text: `Your file has ${pages} pages. We use the first one. Say in the notes if you want something else.` });
  }

  const level = lines.some((l) => l.level === 'low') ? 'low' : lines.some((l) => l.level === 'check') ? 'check' : 'good';
  return { level, lines, suggest };
}
