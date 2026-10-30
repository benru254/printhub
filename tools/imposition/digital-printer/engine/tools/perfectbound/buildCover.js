// Builds the wrap-around cover PDF: back cover | spine | front cover, on one sheet.
// The spine is white, with the title written along it when there is room.

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { mmToPt } from '../../core/units.js';
import { placeOnSheet } from '../../core/artFit.js';
import { drawCropMarks } from '../../core/pdfPieces.js';
import { drawSpreadHalf } from '../booklet/buildPdf.js';

export async function buildCoverPdf({ sourceBytes, plan, title = 'Book cover' }) {
  const { cover, flip } = plan;
  if (!cover.enabled) throw new Error('This book has no cover from the file.');
  if (!cover.layout) throw new Error('The cover is too big for every sheet this printer can take.');

  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('PrintHub Imposition');
  out.setProducer('PrintHub');
  const font = await out.embedFont(StandardFonts.HelveticaBold);

  const layout = cover.layout;
  const { sheetW, sheetH } = layout;
  const W = plan.out.w;
  const H = plan.out.h;
  const half = cover.spine / 2;
  const ctx = { out, src, geometry: plan.geometry, scale: plan.scale, eb: layout.effBleed, W, H, sheetH };
  const page = out.addPage([mmToPt(sheetW), mmToPt(sheetH)]);

  for (const slot of layout.slots) {
    const p = placeOnSheet(slot, { halfW: cover.w / 2, halfH: cover.h / 2 }, false, sheetW, sheetH, flip);
    // A negative shift moves each cover page away from the middle by half the spine.
    await drawSpreadHalf(page, cover.back, -1, -half, p, ctx);
    await drawSpreadHalf(page, cover.front, 1, -half, p, ctx);

    // White spine, fold marks just outside the cover, and the spine title.
    // (u, v) = spread frame in mm, spine centre at 0, v up. Returns PDF mm.
    const a = (p.rot * Math.PI) / 180;
    const along = (u, v) => [p.cx + u * Math.cos(a) - v * Math.sin(a), sheetH - p.cy + u * Math.sin(a) + v * Math.cos(a)];
    const eb = layout.effBleed;
    const [rx, ry] = along(-half, -H / 2 - eb);
    page.drawRectangle({ x: mmToPt(rx), y: mmToPt(ry), width: mmToPt(2 * half), height: mmToPt(H + 2 * eb), color: rgb(1, 1, 1), rotate: degrees(p.rot) });
    for (const u of [-half, half]) {
      for (const [v1, v2] of [[H / 2 + layout.effBleed + 1, H / 2 + layout.effBleed + 5], [-H / 2 - layout.effBleed - 1, -H / 2 - layout.effBleed - 5]]) {
        const [x1, y1] = along(u, v1);
        const [x2, y2] = along(u, v2);
        page.drawLine({ start: { x: mmToPt(x1), y: mmToPt(y1) }, end: { x: mmToPt(x2), y: mmToPt(y2) }, thickness: 0.3, color: rgb(0, 0, 0), dashArray: [2, 2] });
      }
    }
    if (cover.spineText && cover.spine >= 4) {
      let size = Math.min(11, (cover.spine * 0.6 * 72) / 25.4); // points
      const fitW = (font.widthOfTextAtSize(cover.spineText, size) * 25.4) / 72;
      if (fitW > H - 12) size *= (H - 12) / fitW;
      const textW = (font.widthOfTextAtSize(cover.spineText, size) * 25.4) / 72;
      // Reads top to bottom (the usual way for spines), centred on the spine.
      const [x, y] = along(-(size * 0.35 * 25.4) / 72, textW / 2);
      page.drawText(cover.spineText, { x: mmToPt(x), y: mmToPt(y), size, font, color: rgb(0.1, 0.1, 0.1), rotate: degrees(p.rot - 90) });
    }
  }
  drawCropMarks(page, layout, { isBack: false, flip });
  return out.save();
}
