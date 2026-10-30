// Builds the Cut & Stack PDF.
// Page order:
//   printOrder 'sets'    : sheet 1 copy 1, sheet 1 copy 2, sheet 2 copy 1 ... (NCR sets come out collated)
//   printOrder 'grouped' : all sheets of copy 1, then all sheets of copy 2 ...
// With a back side, each front page is followed by its back page.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mmToPt } from '../../core/units.js';
import { computeArtFit } from '../../core/artFit.js';
import { embedPiece, drawPieceAt, drawCropMarks, drawTextOnPiece } from '../../core/pdfPieces.js';
import { itemAt } from './order.js';
import { NUMBER_COLORS, PART_NAMES } from './numbering.js';

const SLUG_GREY = rgb(0.45, 0.45, 0.45);

export async function buildCutStackPdf({ sourceBytes, plan, title = 'Cut and stack', bleedArt = null }) {
  const { layout, flip, stackMode, numbering, sheets, parts, out: size } = plan;
  if (!layout.count) throw new Error('Nothing fits on this sheet.');

  const useMade = stackMode === 'number' && !!plan.madeBleed && layout.effBleed > 0;
  if (useMade && (!bleedArt || bleedArt.length < plan.sides.length)) {
    throw new Error('The made bleed is missing. Please try again.');
  }

  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('PrintHub Imposition');
  out.setProducer('PrintHub');

  const numFont = await out.embedFont(numbering.font === 'machine' ? StandardFonts.CourierBold : StandardFonts.HelveticaBold);
  const slugFont = await out.embedFont(StandardFonts.Helvetica);
  const color = (NUMBER_COLORS[numbering.color] || NUMBER_COLORS.red).pdf;
  const { sheetW, sheetH } = layout;
  const ctx = (isBack) => ({ isBack, sheetW, sheetH, flip, out: size });

  // Prepare pieces once (each design is embedded once and reused on every sheet).
  const pieces = new Map();
  async function pieceFor(page, sideIndex) {
    const key = `${page.index}`;
    if (!pieces.has(key)) {
      // Pages mode: every page is fitted to the finished size the same way as page 1.
      const fit = stackMode === 'pages'
        ? computeArtFit({ srcW: page.trimMm.w, srcH: page.trimMm.h, srcBleed: page.bleedMm, outW: size.w, outH: size.h, mode: plan.mode })
        : plan.fits[sideIndex];
      pieces.set(key, await embedPiece(out, src, {
        page,
        fit,
        effBleed: layout.effBleed,
        out: size,
        bleedArt: useMade ? bleedArt[sideIndex] : null,
      }));
    }
    return pieces.get(key);
  }

  const front = stackMode === 'number' ? await pieceFor(plan.sides[0], 0) : null;
  const back = stackMode === 'number' && plan.twoSided ? await pieceFor(plan.sides[1], 1) : null;

  // Small grey line under the grid: helps the operator check order (outside the pieces).
  const slugY = layout.grid ? layout.grid.y + layout.grid.h + layout.outer + 1.2 : 0;
  const slugRoom = sheetH - layout.margins.bottom - slugY;

  async function addSheet(s, part) {
    // Front
    const page = out.addPage([mmToPt(sheetW), mmToPt(sheetH)]);
    for (let j = 0; j < layout.slots.length; j++) {
      const item = itemAt(s, j, sheets, plan.total);
      if (item === null) continue;
      const slot = layout.slots[j];
      const piece = stackMode === 'pages' ? await pieceFor(plan.sourceGeometry.pages[item], 0) : front;
      drawPieceAt(page, piece, slot, ctx(false));
      if (stackMode === 'number') {
        const text = numbering.format(item);
        for (const at of numbering.positions) {
          drawTextOnPiece(page, slot, { text, font: numFont, size: numbering.size, color, at }, ctx(false));
        }
      }
    }
    drawCropMarks(page, layout, { isBack: false, flip });
    if (slugRoom >= 2.5) {
      const copy = parts > 1 ? ` · copy ${part + 1} of ${parts} (${PART_NAMES[part]})` : '';
      const range = stackMode === 'number' ? ` · ${numbering.format(s)}…` : ` · page ${s + 1}…`;
      page.drawText(`PrintHub · sheet ${s + 1} of ${sheets}${copy}${range}`, {
        x: mmToPt(layout.grid.x),
        y: mmToPt(sheetH - slugY - 1.6),
        size: 5.5,
        font: slugFont,
        color: SLUG_GREY,
      });
    }

    // Back (same design on every piece, no numbers)
    if (back) {
      const bp = out.addPage([mmToPt(sheetW), mmToPt(sheetH)]);
      for (let j = 0; j < layout.slots.length; j++) {
        if (itemAt(s, j, sheets, plan.total) === null) continue;
        drawPieceAt(bp, back, layout.slots[j], ctx(true));
      }
      drawCropMarks(bp, layout, { isBack: true, flip });
    }
  }

  if (plan.printOrder === 'grouped') {
    for (let part = 0; part < parts; part++) for (let s = 0; s < sheets; s++) await addSheet(s, part);
  } else {
    for (let s = 0; s < sheets; s++) for (let part = 0; part < parts; part++) await addSheet(s, part);
  }

  return out.save();
}
