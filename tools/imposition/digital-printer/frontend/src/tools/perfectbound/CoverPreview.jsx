import { useEffect, useRef, useState } from 'react';
import { placeOnSheet, canvasAngle, cropMarks, fmtMm } from '@engine';
import { useWidth } from '../../hooks/useWidth.js';

// The cover sheet: back cover | spine | front cover, as it will be printed.
export default function CoverPreview({ plan, pdf }) {
  const [wrap, width] = useWidth(320);
  const canvasRef = useRef(null);
  const { cover } = plan;
  const [renders, setRenders] = useState(new Map());

  useEffect(() => {
    if (!cover.enabled) return undefined;
    let alive = true;
    Promise.all([cover.back, cover.front].map((i) => pdf.render(i, 700).then((r) => [i, r])))
      .then((list) => alive && setRenders(new Map(list)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pdf, cover.enabled, cover.back, cover.front]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cover.layout) return;
    const layout = cover.layout;
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

    const W = plan.out.w;
    const H = plan.out.h;
    const half = cover.spine / 2;
    for (const slot of layout.slots) {
      const p = placeOnSheet(slot, { halfW: cover.w / 2, halfH: cover.h / 2 }, false, sheetW, sheetH, plan.flip);
      ctx.save();
      ctx.translate(p.cx * k, p.cy * k);
      ctx.rotate(canvasAngle(p.rot));
      [[cover.back, -half - W], [cover.front, half]].forEach(([src, x]) => {
        const r = renders.get(src);
        if (r) {
          const s = r.rectToPx(plan.geometry.pages[src].trimBoxPt);
          ctx.drawImage(r.canvas, s.x, s.y, s.w, s.h, x * k, (-H / 2) * k, W * k, H * k);
        } else {
          ctx.fillStyle = '#e4ebf2';
          ctx.fillRect(x * k, (-H / 2) * k, W * k, H * k);
        }
      });
      // Spine
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-half * k, (-H / 2) * k, 2 * half * k, H * k);
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeStyle = 'rgba(0, 170, 230, 0.9)';
      ctx.lineWidth = dpr;
      for (const u of [-half, half]) {
        ctx.beginPath();
        ctx.moveTo(u * k, (-H / 2) * k);
        ctx.lineTo(u * k, (H / 2) * k);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (cover.spineText && cover.spine >= 4) {
        ctx.save();
        ctx.rotate(Math.PI / 2); // reads top to bottom
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `700 ${Math.max(6, Math.min(11 * 0.3528, cover.spine * 0.6) * k)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cover.spineText, 0, 0, (H - 12) * k);
        ctx.restore();
      }
      ctx.restore();
    }

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = Math.max(1, 0.8 * dpr);
    for (const l of cropMarks(layout)) {
      ctx.beginPath();
      ctx.moveTo(l.x1 * k, l.y1 * k);
      ctx.lineTo(l.x2 * k, l.y2 * k);
      ctx.stroke();
    }
  }, [plan, cover, renders, width]);

  if (!cover.enabled) return <p className="hint cover-empty">No cover from this file. All pages are inside pages.</p>;
  if (!cover.layout) return <p className="error">The open cover ({fmtMm(cover.w)} mm wide) doesn’t fit on any sheet of this printer.</p>;
  return (
    <div ref={wrap} className="preview-wrap">
      <canvas ref={canvasRef} className="preview-canvas" aria-label="Cover print sheet" />
      <p className="hint cover-caption">
        Back · {fmtMm(cover.spine)} mm spine · front — on {cover.paper.label} {cover.sheet.label}
        {cover.sheet.orientation === 'landscape' ? ' landscape' : ''}
      </p>
    </div>
  );
}
