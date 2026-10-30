import { useEffect, useRef } from 'react';
import { cropMarks, pieceDrawing, placeOnSheet, mirrorLine, canvasAngle } from '@engine';
import { useWidth } from '../../hooks/useWidth.js';

// Live preview of the press sheet, drawn on a canvas.
// Uses the SAME plan, pieceDrawing and placeOnSheet as the PDF builder, so what you see is what prints.
// bleedArt: when bleed is made, one canvas per side (piece + made bleed).
export default function SheetPreview({ plan, renders, side, bleedArt }) {
  const [wrap, width] = useWidth(320);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { layout, sides, fits, flip } = plan;
    const { sheetW, sheetH } = layout;
    const isBack = side === 1;
    const page = sides[side] || sides[0];
    const fit = fits[side] || fits[0];
    const render = renders[side];

    const dpr = window.devicePixelRatio || 1;
    const maxH = Math.max(320, window.innerHeight * 0.72);
    const cssW = Math.min(width, (maxH * sheetW) / sheetH);
    const cssH = (cssW * sheetH) / sheetW;
    canvas.style.width = `${Math.round(cssW)}px`;
    canvas.style.height = `${Math.round(cssH)}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    const k = (cssW / sheetW) * dpr; // pixels per mm

    // Paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Printable area (dashed): the printer cannot print outside this. Mirrored for the back.
    const m = layout.margins;
    let area = { x: m.left, y: m.top, w: sheetW - m.left - m.right, h: sheetH - m.top - m.bottom };
    if (isBack && flip === 'calendar') area = { ...area, y: sheetH - area.y - area.h };
    else if (isBack) area = { ...area, x: sheetW - area.x - area.w };
    ctx.save();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = '#b8c4d2';
    ctx.lineWidth = dpr;
    ctx.strokeRect(area.x * k, area.y * k, area.w * k, area.h * k);
    ctx.restore();

    // Pieces
    const made = bleedArt && bleedArt[side];
    const d = made
      ? { halfW: plan.out.w / 2 + layout.effBleed, halfH: plan.out.h / 2 + layout.effBleed }
      : pieceDrawing(fit, layout.effBleed, page);
    const src = !made && render ? render.rectToPx(d.srcBoxPt) : null;
    for (const slot of layout.slots) {
      const p = placeOnSheet(slot, d, isBack, sheetW, sheetH, flip);
      ctx.save();
      ctx.translate(p.cx * k, p.cy * k);
      ctx.rotate(canvasAngle(p.rot));
      if (made) {
        ctx.drawImage(made, -d.halfW * k, -d.halfH * k, 2 * d.halfW * k, 2 * d.halfH * k);
      } else if (src) {
        ctx.drawImage(render.canvas, src.x, src.y, src.w, src.h, -d.halfW * k, -d.halfH * k, 2 * d.halfW * k, 2 * d.halfH * k);
      } else {
        ctx.fillStyle = '#dbe7f3';
        ctx.fillRect(-d.halfW * k, -d.halfH * k, 2 * d.halfW * k, 2 * d.halfH * k);
      }
      ctx.restore();

      // Cut line of each piece (screen only, not printed).
      ctx.save();
      ctx.setLineDash([3 * dpr, 2 * dpr]);
      ctx.strokeStyle = 'rgba(0, 170, 230, 0.9)';
      ctx.lineWidth = dpr;
      ctx.strokeRect((p.cx - slot.w / 2) * k, (p.cy - slot.h / 2) * k, slot.w * k, slot.h * k);
      ctx.restore();
    }

    // Crop marks (printed)
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = Math.max(1, 0.8 * dpr);
    for (const raw of cropMarks(layout)) {
      const l = mirrorLine(raw, isBack, sheetW, sheetH, flip);
      ctx.beginPath();
      ctx.moveTo(l.x1 * k, l.y1 * k);
      ctx.lineTo(l.x2 * k, l.y2 * k);
      ctx.stroke();
    }
  }, [plan, renders, side, width, bleedArt]);

  return (
    <div ref={wrap} className="preview-wrap">
      <canvas ref={canvasRef} className="preview-canvas" aria-label="Print sheet preview" />
    </div>
  );
}
