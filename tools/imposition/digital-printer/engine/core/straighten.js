// Some PDFs store a page sideways and add a "rotate me" note (/Rotate 90). Viewers turn the
// page for you, so the customer sees it upright, but the page contents are still sideways.
// Scanners, Word and phone "print to PDF" do this a lot.
//
// straightenPdf() redraws those pages upright with no rotate note, so every tool, preview and
// printed sheet shows the page exactly the way the customer saw it. Trim and bleed boxes are
// turned with the page. Files with no rotated pages are returned untouched.

import { PDFDocument, PDFName, degrees } from 'pdf-lib';

const BOXES = ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox'];

const angleOf = (page) => ((page.getRotation().angle % 360) + 360) % 360;

// Where a point of the stored page lands on the upright page. m = media box, a = angle.
function turnPoint(x, y, m, a) {
  const px = x - m.x;
  const py = y - m.y;
  if (a === 90) return [py, m.width - px];
  if (a === 180) return [m.width - px, m.height - py];
  if (a === 270) return [m.height - py, px];
  return [px, py];
}

function turnBox(box, m, a) {
  const [x1, y1] = turnPoint(box.x, box.y, m, a);
  const [x2, y2] = turnPoint(box.x + box.width, box.y + box.height, m, a);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/**
 * @returns {Promise<{ bytes: Uint8Array, straightened: number[] }>} straightened = page indexes that were turned
 */
export async function straightenPdf(bytes) {
  let src;
  try {
    src = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return { bytes, straightened: [] }; // readPdfGeometry gives the friendly error
  }
  const pages = src.getPages();
  const turned = pages.map((p, i) => (angleOf(p) % 90 === 0 && angleOf(p) !== 0 ? i : -1)).filter((i) => i >= 0);
  if (!turned.length) return { bytes, straightened: [] };

  const out = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const a = angleOf(page);
    if (!turned.includes(i)) {
      const [copy] = await out.copyPages(src, [i]);
      out.addPage(copy);
      continue;
    }
    const m = page.getMediaBox();
    const sideways = a === 90 || a === 270;
    const W = sideways ? m.height : m.width;
    const H = sideways ? m.width : m.height;
    const fresh = out.addPage([W, H]);
    if (page.node.Contents()) { // an empty page has nothing to redraw
      const embedded = await out.embedPage(page, { left: m.x, bottom: m.y, right: m.x + m.width, top: m.y + m.height });
      // /Rotate turns the page clockwise; drawing it at minus the angle gives the same picture.
      const at = a === 90 ? { x: 0, y: m.width } : a === 180 ? { x: m.width, y: m.height } : { x: m.height, y: 0 };
      fresh.drawPage(embedded, { ...at, width: m.width, height: m.height, rotate: degrees(-a) });
    }

    for (const name of BOXES) {
      if (!page.node.get(PDFName.of(name))) continue;
      const box = { CropBox: () => page.getCropBox(), BleedBox: () => page.getBleedBox(), TrimBox: () => page.getTrimBox(), ArtBox: () => page.getArtBox() }[name]();
      const t = turnBox(box, m, a);
      fresh[`set${name}`](t.x, t.y, t.width, t.height);
    }
  }
  return { bytes: await out.save(), straightened: turned };
}
