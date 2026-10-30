// Builds the print-ready imposed PDF with pdf-lib.
// The customer's pages are placed as vector objects: no quality loss,
// fonts and colours (including CMYK) are kept exactly as they are.
//
// Made bleed: when plan.madeBleed is set, `bleedArt` holds one picture per side
// (the finished piece plus its made bleed, exactly layout.effBleed mm on every side).
// That picture goes UNDER the real design, and the real design is drawn on top
// cut exactly at the trim, so everything inside the cut stays sharp vector.

import { PDFDocument } from 'pdf-lib';
import { mmToPt } from '../../core/units.js';
import { embedPiece, drawPieceAt, drawCropMarks } from '../../core/pdfPieces.js';
import { drawCutContours } from '../../core/cutContour.js';

export async function buildCardsPdf({ sourceBytes, plan, title = 'Imposed sheet', bleedArt = null }) {
  const { layout, sides, fits, flip, madeBleed } = plan;
  if (!layout.count) throw new Error('Nothing fits on this sheet.');

  const useMade = !!madeBleed && layout.effBleed > 0;
  if (useMade && (!bleedArt || bleedArt.length < sides.length)) {
    throw new Error('The made bleed is missing. Please try again.');
  }

  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('PrintHub Imposition');
  out.setProducer('PrintHub');

  const { sheetW, sheetH } = layout;

  for (let i = 0; i < sides.length; i++) {
    const isBack = i === 1;
    const piece = await embedPiece(out, src, {
      page: sides[i],
      fit: fits[i],
      effBleed: layout.effBleed,
      out: plan.out,
      bleedArt: useMade ? bleedArt[i] : null,
    });
    const sheet = out.addPage([mmToPt(sheetW), mmToPt(sheetH)]);
    for (const slot of layout.slots) drawPieceAt(sheet, piece, slot, { isBack, sheetW, sheetH, flip });
    drawCropMarks(sheet, layout, { isBack, flip });
    // Sticker cutter: the cut line goes on the front only (that is the side the cutter reads).
    if (!isBack && plan.shape && plan.shape.cutter === 'plotter') {
      drawCutContours(out, sheet, layout, plan.out, plan.shape);
    }
  }

  return out.save();
}
