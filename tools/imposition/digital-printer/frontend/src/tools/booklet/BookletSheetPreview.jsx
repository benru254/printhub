import { useEffect, useRef } from 'react';
import { cropMarks, placeOnSheet, mirrorLine, canvasAngle } from '@engine';
import { useWidth } from '../../hooks/useWidth.js';

// One printed sheet side: open spreads with big page numbers, so the order is easy to check.
export default function BookletSheetPreview({ plan, sheetIndex, isBack, renders }) {
  const [wrap, width] = useWidth(320);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { layout, flip, spread, order, sheetsInfo } = plan;
    const { sheetW, sheetH } = layout;
    const dpr = window.devicePixelRatio || 1;
    const maxH = Math.max(300, window.innerHeight * 0.62);
    const cssW = Math.min(width, (maxH * sheetW) / sheetH);
    const cssH = (cssW * sheetH) / sheetW;
    canvas.style.width = `${Math.round(cssW)}px`;
    canvas.style.height = `${Math.round(cssH)}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    const k = (cssW / sheetW) * dpr;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!layout.count) return;

    const info = sheetsInfo[sheetIndex];
    const positions = isBack ? info.back : info.front;
    const W = plan.out.w;
    const H = plan.out.h;

    for (const slot of layout.slots) {
      const p = placeOnSheet(slot, { halfW: spread.w / 2, halfH: spread.h / 2 }, isBack, sheetW, sheetH, flip);
      ctx.save();
      ctx.translate(p.cx * k, p.cy * k);
      ctx.rotate(canvasAngle(p.rot));
      positions.forEach((pos, side) => {
        const x = side === 0 ? -W : 0; // left page, right page
        const src = order[pos];
        if (src === null) {
          ctx.fillStyle = '#f1f3f5';
          ctx.fillRect(x * k, (-H / 2) * k, W * k, H * k);
        } else {
          const r = renders.get(src);
          if (r) {
            const s = r.rectToPx(plan.geometry.pages[src].trimBoxPt);
            ctx.drawImage(r.canvas, s.x, s.y, s.w, s.h, x * k, (-H / 2) * k, W * k, H * k);
          } else {
            ctx.fillStyle = '#e4ebf2';
            ctx.fillRect(x * k, (-H / 2) * k, W * k, H * k);
          }
        }
        // Big page number, so the order is easy to check
        const label = src === null ? `${pos + 1} blank` : String(pos + 1);
        const fs = Math.max(12, Math.min(W, H) * k * 0.22);
        ctx.font = `800 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, fs / 9);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillStyle = 'rgba(25, 120, 190, 0.85)';
        ctx.strokeText(label, (x + W / 2) * k, 0);
        ctx.fillText(label, (x + W / 2) * k, 0);
      });
      // Fold line (screen only)
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeStyle = 'rgba(0, 170, 230, 0.9)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(0, (-H / 2) * k);
      ctx.lineTo(0, (H / 2) * k);
      ctx.stroke();
      ctx.strokeRect(-W * k, (-H / 2) * k, 2 * W * k, H * k);
      ctx.restore();
    }

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = Math.max(1, 0.8 * dpr);
    for (const raw of cropMarks(layout)) {
      const l = mirrorLine(raw, isBack, sheetW, sheetH, flip);
      ctx.beginPath();
      ctx.moveTo(l.x1 * k, l.y1 * k);
      ctx.lineTo(l.x2 * k, l.y2 * k);
      ctx.stroke();
    }
  }, [plan, sheetIndex, isBack, renders, width]);

  return (
    <div ref={wrap} className="preview-wrap">
      <canvas ref={canvasRef} className="preview-canvas" aria-label="Booklet print sheet" />
    </div>
  );
}
