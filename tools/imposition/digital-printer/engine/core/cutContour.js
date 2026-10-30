// CUT LINES for sticker cutters (plotters).
//
// 1. In the print PDF: the cut line of every piece is drawn in the spot colour
//    "CutContour" (100% magenta look, overprint). This is the name most print & cut
//    software looks for (Roland VersaWorks, Onyx, Flexi, Summa, Graphtec, Mimaki).
//    The software sends that line to the cutter instead of printing it.
// 2. A separate SVG file with only the cut lines, at the exact sheet size,
//    for Silhouette Studio, Cricut Design Space, Inkscape and others.

import { PDFName, PDFNumber, PDFOperator, PDFOperatorNames, pushGraphicsState, popGraphicsState, setGraphicsState, setLineWidth, moveTo, lineTo, appendBezierCurve, closePath, stroke } from 'pdf-lib';
import { mmToPt } from './units.js';
import { placeOnSheet } from './artFit.js';
import { shapeOutline, mapOutline, outlineToSvg } from './shapes.js';

export const CUT_SPOT_NAME = 'CutContour';
export const CUT_LINE_WIDTH_PT = 0.25;

/**
 * Cut outlines of every piece on a sheet, in SHEET mm (top-left origin).
 * shape: { shape, radius }, out: finished size, isBack: mirror like the back side.
 */
export function sheetCutOutlines(layout, out, shape, { isBack = false, flip = 'book', slots } = {}) {
  const outline = shapeOutline({ shape: shape.shape, w: out.w, h: out.h, radius: shape.radius });
  const list = slots || layout.slots;
  return list.map((slot) => {
    const p = placeOnSheet(slot, { halfW: out.w / 2, halfH: out.h / 2 }, isBack, layout.sheetW, layout.sheetH, flip);
    const a = (p.rot * Math.PI) / 180;
    return mapOutline(outline, (x, y) => {
      const u = x - out.w / 2; // piece frame, centre origin, y up
      const v = out.h / 2 - y;
      return [p.cx + u * Math.cos(a) - v * Math.sin(a), p.cy - (u * Math.sin(a) + v * Math.cos(a))];
    });
  });
}

// Adds the CutContour spot colour to a page (once) and returns its resource name.
function cutColourSpace(doc, page) {
  const resources = page.node.Resources();
  let spaces = resources.lookup(PDFName.of('ColorSpace'));
  if (!spaces) {
    spaces = doc.context.obj({});
    resources.set(PDFName.of('ColorSpace'), spaces);
  }
  const key = PDFName.of('CutCS');
  if (!spaces.get(key)) {
    const tint = doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 0, 0], N: 1 });
    const cs = doc.context.obj([PDFName.of('Separation'), PDFName.of(CUT_SPOT_NAME), PDFName.of('DeviceCMYK'), doc.context.register(tint)]);
    spaces.set(key, doc.context.register(cs));
  }
  return key;
}

/** Draws the cut lines of all pieces on a PDF page in the CutContour spot colour. */
export function drawCutContours(doc, page, layout, out, shape, opts = {}) {
  const outlines = sheetCutOutlines(layout, out, shape, opts);
  if (!outlines.length) return;
  const H = layout.sheetH;
  const cs = cutColourSpace(doc, page);
  const gs = page.node.newExtGState('CutGS', doc.context.register(doc.context.obj({ OP: true, op: true, OPM: 1 })));
  const P = (x, y) => [mmToPt(x), mmToPt(H - y)]; // to PDF points, bottom-left origin
  const ops = [
    pushGraphicsState(),
    setGraphicsState(gs),
    PDFOperator.of(PDFOperatorNames.StrokingColorspace, [cs]),
    PDFOperator.of(PDFOperatorNames.StrokingColorN, [PDFNumber.of(1)]),
    setLineWidth(CUT_LINE_WIDTH_PT),
  ];
  for (const outline of outlines) {
    for (const s of outline) {
      if (s.op === 'Z') ops.push(closePath());
      else if (s.op === 'M') ops.push(moveTo(...P(s.x, s.y)));
      else if (s.op === 'L') ops.push(lineTo(...P(s.x, s.y)));
      else ops.push(appendBezierCurve(...P(s.x1, s.y1), ...P(s.x2, s.y2), ...P(s.x, s.y)));
    }
  }
  ops.push(stroke(), popGraphicsState());
  page.pushOperators(...ops);
}

/** SVG file with only the cut lines, at the real sheet size (1 unit = 1 mm). */
export function buildCutSvg(layout, out, shape, { title = 'PrintHub cut lines', slots } = {}) {
  const outlines = sheetCutOutlines(layout, out, shape, { slots });
  const W = layout.sheetW;
  const H = layout.sheetH;
  const paths = outlines.map((o) => `    <path d="${outlineToSvg(o)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  <title>${title}</title>
  <!-- Sheet ${W} x ${H} mm. Line up this file with the printed sheet in your cutter software. -->
  <g id="${CUT_SPOT_NAME}" fill="none" stroke="#ff00ff" stroke-width="0.25">
${paths}
  </g>
</svg>
`;
}
