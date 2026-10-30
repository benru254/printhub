import { useEffect, useRef } from 'react';
import { cropMarks, pieceDrawing, placeOnSheet, mirrorLine, canvasAngle, shapeOutline, outlineToCanvas } from '@engine';
import { useWidth } from '../../hooks/useWidth.js';

// Live preview of the press sheet, drawn on a canvas.
// Uses the SAME plan, pieceDrawing and placeOnSheet as the PDF builder, so what you see is what prints.
// bleedArt: when bleed is made, one canvas per side (piece + made bleed).
// Optional (used by Cut & Stack):
//   pieceAt(index)  -> { render, page, fit } to show a different page in a spot, or null for an empty spot
//   decorate(ctx, { slot, index, p, k, isBack }) -> draw extra things on a piece (numbers, stack labels)
export default function SheetPreview({ plan, renders, side, bleedArt, pieceAt, decorate }) {
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
    layout.slots.forEach((slot, index) => {
      // A spot can show its own page (Cut & Stack pages mode), or be empty.
      let pd = d;
      let pSrc = src;
      let pRender = render;
      if (pieceAt) {
        const own = pieceAt(index);
        if (own === null) return; // empty spot
        if (own && !made) {
          pd = pieceDrawing(own.fit, layout.effBleed, own.page);
          pRender = own.render;
          pSrc = own.render ? own.render.rectToPx(pd.srcBoxPt) : null;
        }
      }
      const p = placeOnSheet(slot, pd, isBack, sheetW, sheetH, flip);
      ctx.save();
      ctx.translate(p.cx * k, p.cy * k);
      ctx.rotate(canvasAngle(p.rot));
      if (made) {
        ctx.drawImage(made, -d.halfW * k, -d.halfH * k, 2 * d.halfW * k, 2 * d.halfH * k);
      } else if (pSrc) {
        ctx.drawImage(pRender.canvas, pSrc.x, pSrc.y, pSrc.w, pSrc.h, -pd.halfW * k, -pd.halfH * k, 2 * pd.halfW * k, 2 * pd.halfH * k);
      } else {
        ctx.fillStyle = '#dbe7f3';
        ctx.fillRect(-pd.halfW * k, -pd.halfH * k, 2 * pd.halfW * k, 2 * pd.halfH * k);
      }
      ctx.restore();

      // Cut line of each piece: dashed blue on screen for a guillotine,
      // solid magenta for a sticker cutter (that line is in the PDF as CutContour).
      const sh = plan.shape || { shape: 'rect', cutter: 'guillotine' };
      ctx.save();
      if (sh.shape === 'rect' && sh.cutter !== 'plotter') {
        ctx.setLineDash([3 * dpr, 2 * dpr]);
        ctx.strokeStyle = 'rgba(0, 170, 230, 0.9)';
        ctx.lineWidth = dpr;
        ctx.strokeRect((p.cx - slot.w / 2) * k, (p.cy - slot.h / 2) * k, slot.w * k, slot.h * k);
      } else {
        ctx.translate(p.cx * k, p.cy * k);
        ctx.rotate(canvasAngle(p.rot));
        const outline = shapeOutline({ shape: sh.shape, w: plan.out.w, h: plan.out.h, radius: sh.radius });
        outlineToCanvas(ctx, outline, (x, y) => [(x - plan.out.w / 2) * k, (y - plan.out.h / 2) * k]);
        if (sh.cutter === 'plotter') {
          ctx.strokeStyle = '#ff00ff';
          ctx.lineWidth = Math.max(1, 1.2 * dpr);
        } else {
          ctx.setLineDash([3 * dpr, 2 * dpr]);
          ctx.strokeStyle = 'rgba(0, 170, 230, 0.9)';
          ctx.lineWidth = dpr;
        }
        ctx.stroke();
      }
      ctx.restore();

      if (decorate) {
        ctx.save();
        decorate(ctx, { slot, index, p, k, isBack });
        ctx.restore();
      }
    });

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
  }, [plan, renders, side, width, bleedArt, pieceAt, decorate]);

  return (
    <div ref={wrap} className="preview-wrap">
      <canvas ref={canvasRef} className="preview-canvas" aria-label="Print sheet preview" />
    </div>
  );
}
