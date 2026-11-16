// Builds the print-ready PDF of a large format job: one page per panel.
// The customer's page is placed as a vector object (no quality loss). The hem and trim
// area is filled by mirroring the design's edges, and each panel carries cut marks,
// join lines, eyelet marks and a label.

import { PDFDocument, StandardFonts, cmyk, pushGraphicsState, popGraphicsState, concatTransformationMatrix, rectangle, clip, endPath } from 'pdf-lib';
import { mmToPt } from '../../core/units.js';
import { pieceDrawing } from '../../core/artFit.js';
import { hasContent, REGISTRATION } from '../../core/pdfPieces.js';
import { EYELET_HOLE } from './finish.js';
import { sizeText } from '../../core/catalogue.js';

const MARK = 5; // mm, length of a cut mark
const GREY = cmyk(0, 0, 0, 0.55);

export function panelLabel(plan, panel, title) {
  const parts = [title, `finished ${sizeText(plan.finished.w, plan.finished.h)}`];
  if (plan.panels.length > 1) parts.push(`part ${panel.index + 1} of ${plan.panels.length}`);
  if (plan.hem) parts.push(`hem ${plan.hem} mm`);
  if (plan.overlap && plan.panels.length > 1) parts.push(`overlap ${plan.overlap} mm`);
  if (plan.copies > 1) parts.push(`${plan.copies} copies`);
  parts.push(plan.scale === 1 ? 'print at 100%' : 'PRINT AT 1000%');
  return parts.filter(Boolean).join(' · ');
}

export async function buildLargeFormatPdf({ sourceBytes, plan, title = 'Large format' }) {
  if (!plan.fits || !plan.panels.length) throw new Error('This print does not fit. Change the size or the roll.');
  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('PrintHub Large Format');
  out.setProducer('PrintHub');
  const font = await out.embedFont(StandardFonts.Helvetica);

  const { finished, extra, print, fit, scale: s } = plan;
  const srcPage = src.getPage(plan.page.index);
  const withBleed = pieceDrawing(fit, plan.artBleed, plan.page); // the design with its own bleed
  const noBleed = pieceDrawing(fit, 0, plan.page); // the design cut at the finished size (for mirroring)
  const embed = async (d) =>
    hasContent(srcPage)
      ? out.embedPage(srcPage, { left: d.srcBoxPt.x, bottom: d.srcBoxPt.y, right: d.srcBoxPt.x + d.srcBoxPt.width, top: d.srcBoxPt.y + d.srcBoxPt.height })
      : null;
  const art = await embed(withBleed);
  const tile = plan.fill === 'mirror' ? await embed(noBleed) : null;
  const pt = mmToPt;

  for (const panel of plan.panels) {
    const { w: pageW, h: pageH } = plan.pageSize;
    const page = out.addPage([pt(pageW) * s, pt(pageH) * s]);
    // Where the panel sits on the page, and where the print area's top-left corner is (page mm, top-left origin).
    const offX = (pageW - panel.w) / 2;
    const offY = (pageH - panel.h) / 2;
    const originX = offX - panel.x;
    const originY = offY - panel.y;
    const Y = (y) => pageH - y; // top-left mm -> PDF (bottom-left)
    const cx = originX + extra.left + finished.w / 2; // centre of the finished size
    const cy = originY + extra.top + finished.h / 2;

    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(s, 0, 0, s, 0, 0));

    // Everything printed stays inside this panel.
    page.pushOperators(pushGraphicsState(), rectangle(pt(offX), pt(Y(offY + panel.h)), pt(panel.w), pt(panel.h)), clip(), endPath());

    if (tile) {
      // Mirror the design across each finished edge (and corner) to fill the hem and trim area.
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          if (!dx && !dy) continue;
          if ((dx < 0 && extra.left <= plan.artBleed) || (dx > 0 && extra.right <= plan.artBleed)) continue;
          if ((dy < 0 && extra.top <= plan.artBleed) || (dy > 0 && extra.bottom <= plan.artBleed)) continue;
          const tx = cx + dx * finished.w; // centre of the mirrored copy
          const ty = cy + dy * finished.h;
          page.pushOperators(
            pushGraphicsState(),
            rectangle(pt(tx - finished.w / 2), pt(Y(ty + finished.h / 2)), pt(finished.w), pt(finished.h)), clip(), endPath(),
            // Flip around the copy's own centre.
            concatTransformationMatrix(dx ? -1 : 1, 0, 0, dy ? -1 : 1, dx ? 2 * pt(tx) : 0, dy ? 2 * pt(Y(ty)) : 0)
          );
          page.drawPage(tile, { x: pt(tx - noBleed.halfW), y: pt(Y(ty) - noBleed.halfH), width: pt(2 * noBleed.halfW), height: pt(2 * noBleed.halfH) });
          page.pushOperators(popGraphicsState());
        }
      }
    }
    if (art) {
      // Never past the print area (a design with a lot of bleed).
      page.pushOperators(pushGraphicsState(), rectangle(pt(originX), pt(Y(originY + print.h)), pt(print.w), pt(print.h)), clip(), endPath());
      page.drawPage(art, { x: pt(cx - withBleed.halfW), y: pt(Y(cy) - withBleed.halfH), width: pt(2 * withBleed.halfW), height: pt(2 * withBleed.halfH) });
      page.pushOperators(popGraphicsState());
    }

    // Eyelet marks: a thin ring where each eyelet is punched.
    for (const e of plan.eyelets) {
      const ex = originX + extra.left + e.x;
      const ey = originY + extra.top + e.y;
      if (ex < offX || ex > offX + panel.w || ey < offY || ey > offY + panel.h) continue;
      page.drawCircle({ x: pt(ex), y: pt(Y(ey)), size: pt(EYELET_HOLE / 2), borderColor: GREY, borderWidth: 0.6 });
      page.drawLine({ start: { x: pt(ex - 2), y: pt(Y(ey)) }, end: { x: pt(ex + 2), y: pt(Y(ey)) }, thickness: 0.4, color: GREY });
      page.drawLine({ start: { x: pt(ex), y: pt(Y(ey - 2)) }, end: { x: pt(ex), y: pt(Y(ey + 2)) }, thickness: 0.4, color: GREY });
    }
    page.pushOperators(popGraphicsState()); // end of the panel clip

    if (plan.marks) {
      const room = Math.min(offX, offY); // free strip around the panel
      const len = Math.min(MARK, Math.max(0, room - 1.5));
      const line = (x1, y1, x2, y2, color = REGISTRATION, thickness = 0.35) =>
        page.drawLine({ start: { x: pt(x1), y: pt(Y(y1)) }, end: { x: pt(x2), y: pt(Y(y2)) }, thickness, color });
      const left = offX;
      const right = offX + panel.w;
      const top = offY;
      const bottom = offY + panel.h;
      if (len > 0.5) {
        // Lines down the page: the finished edges (cut or fold) and the join lines.
        const vertical = [originX + extra.left, originX + extra.left + finished.w];
        if (panel.col > 0) vertical.push(left + plan.overlap);
        if (panel.col < plan.cols - 1) vertical.push(right - plan.overlap);
        for (const x of vertical) {
          if (x < left - 0.01 || x > right + 0.01) continue;
          line(x, top - 1 - len, x, top - 1);
          line(x, bottom + 1, x, bottom + 1 + len);
        }
        const horizontal = [originY + extra.top, originY + extra.top + finished.h];
        if (panel.row > 0) horizontal.push(top + plan.overlap);
        if (panel.row < plan.rows - 1) horizontal.push(bottom - plan.overlap);
        for (const y of horizontal) {
          if (y < top - 0.01 || y > bottom + 0.01) continue;
          line(left - 1 - len, y, left - 1, y);
          line(right + 1, y, right + 1 + len, y);
        }
      }
      if (offY >= 5) {
        const size = Math.max(5, Math.min(9, pt(offY) * 0.45));
        const max = pt(panel.w) - pt(4 * MARK);
        let text = safeText(panelLabel(plan, panel, title));
        while (text.length > 12 && font.widthOfTextAtSize(text, size) > max) text = `${text.slice(0, -4).trimEnd()}...`;
        page.drawText(text, { x: pt(left + 2 * MARK), y: pt(Y(bottom + offY / 2)) - size / 3, size, font, color: GREY });
      }
    }
    page.pushOperators(popGraphicsState());
  }
  return out.save();
}

// The standard PDF fonts only know basic Western characters: anything else becomes "?".
function safeText(text) {
  return String(text).replace(/×/g, 'x').replace(/…/g, '...').replace(/·/g, '-').replace(/[^\x20-\x7E]/g, '?');
}
