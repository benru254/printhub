// Shared PDF drawing for every grid-based tool (cards, cut & stack...).
// Places finished pieces on a sheet page, draws crop marks, and writes text
// (like numbers) on pieces, all using the same placement as the live preview.

import { cmyk, degrees } from 'pdf-lib';
import { mmToPt } from './units.js';
import { cropMarks } from './marks.js';
import { pieceDrawing, placeOnSheet, mirrorLine } from './artFit.js';

// Registration colour (100% on all four plates) so marks show on every plate.
export const REGISTRATION = cmyk(1, 1, 1, 1);

// pdf-lib turns things around their bottom-left corner. This finds where that
// corner must go so the drawing ends up centred on (cx, cy) after turning.
export function cornerFor(p, cyPdf) {
  return {
    0: [p.cx - p.halfW, cyPdf - p.halfH],
    90: [p.cx + p.halfW, cyPdf - p.halfH],
    [-90]: [p.cx - p.halfW, cyPdf + p.halfH],
    180: [p.cx + p.halfW, cyPdf + p.halfH],
  }[p.rot];
}

/**
 * Prepares one source page for drawing many times.
 * bleedArt: { bytes, format } picture of piece + made bleed (or null).
 */
export async function embedPiece(outDoc, srcDoc, { page, fit, effBleed, out, bleedArt = null }) {
  const useMade = !!bleedArt && effBleed > 0;
  // With made bleed the real design is cut at the trim; the picture gives the bleed.
  const d = pieceDrawing(fit, useMade ? 0 : effBleed, page);
  const b = d.srcBoxPt;
  const embedded = await outDoc.embedPage(srcDoc.getPage(page.index), {
    left: b.x,
    bottom: b.y,
    right: b.x + b.width,
    top: b.y + b.height,
  });
  let art = null;
  let artDrawing = null;
  if (useMade) {
    art = bleedArt.format === 'png' ? await outDoc.embedPng(bleedArt.bytes) : await outDoc.embedJpg(bleedArt.bytes);
    artDrawing = { halfW: out.w / 2 + effBleed, halfH: out.h / 2 + effBleed };
  }
  return { d, embedded, art, artDrawing };
}

// Draws one prepared piece into one slot.
export function drawPieceAt(sheet, piece, slot, { isBack, sheetW, sheetH, flip }) {
  if (piece.art) {
    const pa = placeOnSheet(slot, piece.artDrawing, isBack, sheetW, sheetH, flip);
    const [x, y] = cornerFor(pa, sheetH - pa.cy);
    sheet.drawImage(piece.art, {
      x: mmToPt(x),
      y: mmToPt(y),
      width: mmToPt(2 * piece.artDrawing.halfW),
      height: mmToPt(2 * piece.artDrawing.halfH),
      rotate: degrees(pa.rot),
    });
  }
  const p = placeOnSheet(slot, piece.d, isBack, sheetW, sheetH, flip);
  const [x, y] = cornerFor(p, sheetH - p.cy);
  sheet.drawPage(piece.embedded, {
    x: mmToPt(x),
    y: mmToPt(y),
    width: mmToPt(2 * piece.d.halfW),
    height: mmToPt(2 * piece.d.halfH),
    rotate: degrees(p.rot),
  });
}

export function drawCropMarks(sheet, layout, { isBack, flip }) {
  const { sheetW, sheetH } = layout;
  for (const raw of cropMarks(layout)) {
    const l = mirrorLine(raw, isBack, sheetW, sheetH, flip);
    sheet.drawLine({
      start: { x: mmToPt(l.x1), y: mmToPt(sheetH - l.y1) },
      end: { x: mmToPt(l.x2), y: mmToPt(sheetH - l.y2) },
      thickness: 0.3,
      color: REGISTRATION,
    });
  }
}

/**
 * Writes text centred on a point of a piece.
 * at: { x, y } in mm from the top-left of the finished piece. size in points.
 */
export function drawTextOnPiece(sheet, slot, { text, font, size, color, at }, { out, isBack, sheetW, sheetH, flip }) {
  const p = placeOnSheet(slot, { halfW: out.w / 2, halfH: out.h / 2 }, isBack, sheetW, sheetH, flip);
  const widthMm = (font.widthOfTextAtSize(text, size) * 25.4) / 72;
  const capMm = (size * 0.7 * 25.4) / 72; // height of digits and capitals
  // Start of the text baseline, in the piece frame (origin = centre, y up).
  const u = at.x - out.w / 2 - widthMm / 2;
  const v = out.h / 2 - at.y - capMm / 2;
  const a = (p.rot * Math.PI) / 180;
  const X = p.cx + u * Math.cos(a) - v * Math.sin(a);
  const Y = sheetH - p.cy + u * Math.sin(a) + v * Math.cos(a);
  sheet.drawText(text, { x: mmToPt(X), y: mmToPt(Y), size, font, color, rotate: degrees(p.rot) });
}
