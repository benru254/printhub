// Margin test sheet: print it once to find a printer's real margins.
// Each side has a ruler of lines 0-15 mm from the paper edge.
// The first line you can see on the printed sheet is that side's margin.
// Page 2 is for checking that the back lines up with the front.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mmToPt } from './units.js';

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);

export async function buildMarginTestPdf({ sheet, flip = 'book' }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`PrintHub margin test ${sheet.label}`);
  doc.setCreator('PrintHub');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = sheet.w;
  const H = sheet.h;

  for (let side = 0; side < 2; side++) {
    const page = doc.addPage([mmToPt(W), mmToPt(H)]);
    // Helpers in mm, origin TOP-LEFT (like the rest of the app).
    const line = (x1, y1, x2, y2, t = 0.35) =>
      page.drawLine({ start: { x: mmToPt(x1), y: mmToPt(H - y1) }, end: { x: mmToPt(x2), y: mmToPt(H - y2) }, thickness: t, color: BLACK });
    const text = (s, x, y, size = 7, f = font, color = BLACK) =>
      page.drawText(s, { x: mmToPt(x), y: mmToPt(H - y), size, font: f, color });
    const centered = (s, y, size, f = font, color = BLACK) => {
      const w = f.widthOfTextAtSize(s, size) / (72 / 25.4);
      text(s, (W - w) / 2, y, size, f, color);
    };

    // Rulers at 1/4, 1/2 and 3/4 of each edge (shows if the paper goes in crooked).
    for (const f of [0.25, 0.5, 0.75]) {
      const cx = W * f;
      const cy = H * f;
      for (let d = 0; d <= 15; d++) {
        const len = d % 5 === 0 ? 8 : 4;
        line(cx - len / 2, d, cx + len / 2, d); // top
        line(cx - len / 2, H - d, cx + len / 2, H - d); // bottom
        line(d, cy - len / 2, d, cy + len / 2); // left
        line(W - d, cy - len / 2, W - d, cy + len / 2); // right
      }
      for (const d of [5, 10, 15]) {
        text(String(d), cx + 5, d + 1, 6);
        text(String(d), cx + 5, H - d + 1, 6);
        text(String(d), d - 1.5, cy - 5.5, 6);
        text(String(d), W - d - 1.5, cy - 5.5, 6);
      }
    }

    // Side names
    text('TOP', W * 0.5 - 4, 22, 9, bold);
    text('BOTTOM', W * 0.5 - 7, H - 19, 9, bold);
    text('LEFT', 19, H * 0.5 + 1.5, 9, bold);
    text('RIGHT', W - 31, H * 0.5 + 1.5, 9, bold);

    // Centre cross: front and back should line up when held against light.
    line(W / 2 - 15, H / 2, W / 2 + 15, H / 2, 0.5);
    line(W / 2, H / 2 - 15, W / 2, H / 2 + 15, 0.5);
    page.drawCircle({ x: mmToPt(W / 2), y: mmToPt(H / 2), size: mmToPt(8), borderColor: BLACK, borderWidth: 0.5 });

    const top = H * 0.5 - 70;
    if (H < 200) {
      centered(side === 0 ? 'PrintHub margin test' : 'Back side', H * 0.5 - 22, 9, bold);
      centered('Print at 100% (Actual size)', H * 0.5 + 24, 7);
      continue;
    }
    if (side === 0) {
      centered(`PrintHub margin test · ${sheet.label} ${Math.round(W)} × ${Math.round(H)} mm`, top, 13, bold);
      const lines = [
        '1. Print this page at 100% ("Actual size"). Do NOT use "Fit to page".',
        '2. On each side, find the first line you can see. That number is the margin in mm.',
        '   If you see the 0 line, the printer prints to the edge (margin 0).',
        '3. Enter the 4 numbers in PrintHub: Printers > Edit > Margins.',
        '4. Optional: print both pages double-sided and hold against light.',
        '   The circles in the middle should line up.',
      ];
      lines.forEach((s, i) => text(s, Math.max(20, W / 2 - 75), top + 10 + i * 6, 8));
      centered('Which edge went into the printer first? ____________', top + 52, 8, font, GREY);
    } else {
      centered('Back side · check front and back line up', top, 12, bold);
      centered(`Printed for: turn ${flip === 'calendar' ? 'like a calendar (top-bottom)' : 'like a book page (left-right)'}`, top + 8, 8, font, GREY);
    }
  }

  return doc.save();
}
