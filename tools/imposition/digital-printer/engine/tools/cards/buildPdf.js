// Builds the print-ready imposed PDF with pdf-lib.
// The customer's pages are placed as vector objects: no quality loss,
// fonts and colours (including CMYK) are kept exactly as they are.
//
// Made bleed: when plan.madeBleed is set, `bleedArt` holds one picture per side
// (the finished piece plus its made bleed, exactly layout.effBleed mm on every side).
// That picture goes UNDER the real design, and the real design is drawn on top
// cut exactly at the trim, so everything inside the cut stays sharp vector.

import { PDFDocument, degrees, cmyk } from 'pdf-lib';
import { mmToPt } from '../../core/units.js';
import { cropMarks } from '../../core/marks.js';
import { pieceDrawing, placeOnSheet, mirrorLine } from '../../core/artFit.js';

// Registration colour (100% on all four plates) so marks show on every plate.
const REGISTRATION = cmyk(1, 1, 1, 1);

// pdf-lib turns things around their bottom-left corner. This finds where that
// corner must go so the drawing ends up centred on (cx, cy) after turning.
function cornerFor(p, cyPdf) {
  return {
    0: [p.cx - p.halfW, cyPdf - p.halfH],
    90: [p.cx + p.halfW, cyPdf - p.halfH],
    [-90]: [p.cx - p.halfW, cyPdf + p.halfH],
    180: [p.cx + p.halfW, cyPdf + p.halfH],
  }[p.rot];
}

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
  const lines = cropMarks(layout);

  for (let i = 0; i < sides.length; i++) {
    const isBack = i === 1;
    // With made bleed the real design is cut at the trim (eb = 0); the picture gives the bleed.
    const d = pieceDrawing(fits[i], useMade ? 0 : layout.effBleed, sides[i]);
    const b = d.srcBoxPt;
    const embedded = await out.embedPage(src.getPage(sides[i].index), {
      left: b.x,
      bottom: b.y,
      right: b.x + b.width,
      top: b.y + b.height,
    });

    let art = null;
    let artDrawing = null;
    if (useMade) {
      const a = bleedArt[i];
      art = a.format === 'png' ? await out.embedPng(a.bytes) : await out.embedJpg(a.bytes);
      // The picture covers the whole piece plus bleed on every side.
      artDrawing = { halfW: plan.out.w / 2 + layout.effBleed, halfH: plan.out.h / 2 + layout.effBleed };
    }

    const sheet = out.addPage([mmToPt(sheetW), mmToPt(sheetH)]);

    for (const slot of layout.slots) {
      if (art) {
        const pa = placeOnSheet(slot, artDrawing, isBack, sheetW, sheetH, flip);
        const [x, y] = cornerFor(pa, sheetH - pa.cy);
        sheet.drawImage(art, {
          x: mmToPt(x),
          y: mmToPt(y),
          width: mmToPt(2 * artDrawing.halfW),
          height: mmToPt(2 * artDrawing.halfH),
          rotate: degrees(pa.rot),
        });
      }
      const p = placeOnSheet(slot, d, isBack, sheetW, sheetH, flip);
      const [x, y] = cornerFor(p, sheetH - p.cy);
      sheet.drawPage(embedded, {
        x: mmToPt(x),
        y: mmToPt(y),
        width: mmToPt(2 * d.halfW),
        height: mmToPt(2 * d.halfH),
        rotate: degrees(p.rot),
      });
    }

    for (const raw of lines) {
      const l = mirrorLine(raw, isBack, sheetW, sheetH, flip);
      sheet.drawLine({
        start: { x: mmToPt(l.x1), y: mmToPt(sheetH - l.y1) },
        end: { x: mmToPt(l.x2), y: mmToPt(sheetH - l.y2) },
        thickness: 0.3,
        color: REGISTRATION,
      });
    }
  }

  return out.save();
}
