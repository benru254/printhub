// Builds the booklet PDF: for each sheet, the front page then the back page.
// Print double-sided, all pages, then fold and staple each set.
//
// Each page of a spread is placed with its own bleed on the outside edges
// (none at the fold), and moved toward the fold by the creep amount.

import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { mmToPt, PT_PER_MM } from '../../core/units.js';
import { placeOnSheet } from '../../core/artFit.js';
import { cornerFor, drawCropMarks, REGISTRATION } from '../../core/pdfPieces.js';

const FOLD_GREY = rgb(0.45, 0.45, 0.45);

export async function buildBookletPdf({ sourceBytes, plan, title = 'Booklet' }) {
  const { layout, flip, sheetsInfo, order, scale, spread } = plan;
  if (!layout.count) throw new Error('The booklet does not fit on this sheet.');

  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('PrintHub Imposition');
  out.setProducer('PrintHub');

  const { sheetW, sheetH } = layout;
  const eb = layout.effBleed; // bleed in output mm
  const W = plan.out.w;
  const H = plan.out.h;

  // Draws one page of a spread. half: -1 = left page, +1 = right page. shift = creep (mm).
  async function drawHalf(pdfPage, sourceIndex, half, shift, p) {
    const page = plan.geometry.pages[sourceIndex];
    const t = page.trimBoxPt;
    const toSrc = (mm) => (mm / scale) * PT_PER_MM; // output mm -> source points
    const bleed = Math.min(eb, page.bleedMm * scale);
    // Left page: bleed on the left (outside), cut at the fold minus the creep shift.
    // Right page: the other way round.
    const left = half < 0 ? t.x - toSrc(bleed) : t.x + toSrc(shift);
    const right = half < 0 ? t.x + t.width - toSrc(shift) : t.x + t.width + toSrc(bleed);
    const box = { left, right, bottom: t.y - toSrc(bleed), top: t.y + t.height + toSrc(bleed) };
    const embedded = await out.embedPage(src.getPage(sourceIndex), box);

    const drawnW = W + bleed - shift; // mm
    const drawnH = H + 2 * bleed;
    const u = half < 0 ? -drawnW / 2 : drawnW / 2; // centre of this page, spread frame (fold at 0)
    const a = (p.rot * Math.PI) / 180;
    const cx = p.cx + u * Math.cos(a);
    const cyPdf = sheetH - p.cy + u * Math.sin(a);
    const turned = p.rot === 90 || p.rot === -90;
    const corner = cornerFor({ cx, rot: p.rot, halfW: turned ? drawnH / 2 : drawnW / 2, halfH: turned ? drawnW / 2 : drawnH / 2 }, cyPdf);
    pdfPage.drawPage(embedded, {
      x: mmToPt(corner[0]),
      y: mmToPt(corner[1]),
      width: mmToPt(drawnW),
      height: mmToPt(drawnH),
      rotate: degrees(p.rot),
    });
  }

  // Short dashed lines outside the grid, in line with each fold.
  function drawFoldMarks(pdfPage, isBack) {
    if (!layout.marks) return;
    const off = layout.markOffset;
    const len = layout.markLength;
    for (const slot of layout.slots) {
      const p = placeOnSheet(slot, { halfW: spread.w / 2, halfH: spread.h / 2 }, isBack, sheetW, sheetH, flip);
      const lines = slot.rotated
        ? [
            [layout.grid.x - off - len, p.cy, layout.grid.x - off, p.cy],
            [layout.grid.x + layout.grid.w + off, p.cy, layout.grid.x + layout.grid.w + off + len, p.cy],
          ]
        : [
            [p.cx, layout.grid.y - off - len, p.cx, layout.grid.y - off],
            [p.cx, layout.grid.y + layout.grid.h + off, p.cx, layout.grid.y + layout.grid.h + off + len],
          ];
      for (const [x1, y1, x2, y2] of lines) {
        pdfPage.drawLine({
          start: { x: mmToPt(x1), y: mmToPt(sheetH - y1) },
          end: { x: mmToPt(x2), y: mmToPt(sheetH - y2) },
          thickness: 0.3,
          color: REGISTRATION,
          dashArray: [2, 2],
        });
      }
    }
  }

  for (let i = 0; i < sheetsInfo.length; i++) {
    const shift = plan.shiftFor(i);
    for (const isBack of [false, true]) {
      const [leftPos, rightPos] = isBack ? sheetsInfo[i].back : sheetsInfo[i].front;
      const pdfPage = out.addPage([mmToPt(sheetW), mmToPt(sheetH)]);
      for (const slot of layout.slots) {
        const p = placeOnSheet(slot, { halfW: spread.w / 2, halfH: spread.h / 2 }, isBack, sheetW, sheetH, flip);
        if (order[leftPos] !== null) await drawHalf(pdfPage, order[leftPos], -1, shift, p);
        if (order[rightPos] !== null) await drawHalf(pdfPage, order[rightPos], 1, shift, p);
      }
      drawCropMarks(pdfPage, layout, { isBack, flip });
      drawFoldMarks(pdfPage, isBack);
      if (layout.grid && sheetH - layout.margins.bottom - (layout.grid.y + layout.grid.h + layout.outer) > 2.5) {
        pdfPage.drawText(`PrintHub booklet · sheet ${i + 1} of ${sheetsInfo.length} · ${isBack ? 'back' : 'front'} · pages ${leftPos + 1} | ${rightPos + 1}`, {
          x: mmToPt(layout.grid.x),
          y: mmToPt(sheetH - (layout.grid.y + layout.grid.h + layout.outer + 2.8)),
          size: 5.5,
          color: FOLD_GREY,
        });
      }
    }
  }

  return out.save();
}
