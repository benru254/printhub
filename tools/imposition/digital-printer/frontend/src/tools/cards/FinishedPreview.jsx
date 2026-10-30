import { useEffect, useRef } from 'react';
import { fmtSize, fmtMm, shapeOutline, outlineToCanvas } from '@engine';
import { useWidth } from '../../hooks/useWidth.js';
import { drawPiece } from './drawPiece.js';

const SAFE_COLOR = '#ff4fb0';

// What the customer gets after cutting: each finished piece at its true shape,
// trimmed (no bleed), including Fill / Fit / Stretch.
// Also shows the safe line and marks anything too close to the edge.
export default function FinishedPreview({ plan, renders, copies, unit, safety }) {
  const [wrap, width] = useWidth(320);
  const canvasRef = useRef(null);
  const n = plan.sides.length;
  const safe = plan.settings.safe;
  const problems = safety ? safety.some((s) => s && (s.text.length || s.regions.length)) : false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { out, sides, fits } = plan;
    const dpr = window.devicePixelRatio || 1;
    const pad = 18;
    const labelH = 24;
    const maxH = Math.min(460, Math.max(240, window.innerHeight * 0.5));

    // Pieces side by side, or one above the other: whichever shows them bigger.
    const kRow = Math.min((width - pad * (n + 1)) / (n * out.w), (maxH - 2 * pad - labelH) / out.h);
    const kCol = Math.min((width - 2 * pad) / out.w, (maxH * 1.5 - pad * (n + 1) - labelH * n) / (n * out.h));
    const row = n === 1 || kRow >= kCol;
    const k = row ? kRow : kCol;
    const pw = out.w * k;
    const ph = out.h * k;
    const cssH = row ? ph + 2 * pad + labelH : n * (ph + labelH) + pad * (n + 1);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${Math.round(cssH)}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, cssH);

    const totalW = row ? n * pw + (n - 1) * pad : pw;
    const x0 = (width - totalW) / 2;

    sides.forEach((page, i) => {
      const x = row ? x0 + i * (pw + pad) : x0;
      const y = row ? pad : pad + i * (ph + labelH + pad);

      // Paper with a soft shadow, then the design cut at the finished size and shape.
      const sh = plan.shape || { shape: 'rect' };
      const outline = shapeOutline({ shape: sh.shape, w: out.w, h: out.h, radius: sh.radius });
      const toPx = (mx, my) => [x + mx * k, y + my * k];
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#ffffff';
      outlineToCanvas(ctx, outline, toPx);
      ctx.fill();
      ctx.restore();
      ctx.save();
      outlineToCanvas(ctx, outline, toPx);
      ctx.clip();
      drawPiece(ctx, renders[i], fits[i], page, x, y, k);
      ctx.restore();

      // Safe line: keep text and logos inside it.
      const s = safe * k;
      if (s > 2 && pw > 2 * s && ph > 2 * s) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = SAFE_COLOR;
        ctx.strokeRect(x + s, y + s, pw - 2 * s, ph - 2 * s);
        ctx.restore();
      }

      // Problems from the safe zone check.
      const result = safety && safety[i];
      if (result) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 4, y - 4, pw + 8, ph + 8);
        ctx.clip();
        for (const r of result.regions) {
          ctx.fillStyle = 'rgba(255, 170, 0, 0.28)';
          ctx.strokeStyle = 'rgba(255, 170, 0, 0.95)';
          ctx.lineWidth = 1.5;
          ctx.fillRect(x + r.x * k, y + r.y * k, r.w * k, r.h * k);
          ctx.strokeRect(x + r.x * k, y + r.y * k, r.w * k, r.h * k);
        }
        for (const t of result.text) {
          const b = t.box;
          ctx.fillStyle = 'rgba(255, 40, 40, 0.22)';
          ctx.strokeStyle = '#ff2b2b';
          ctx.lineWidth = 2;
          ctx.fillRect(x + b.x * k, y + b.y * k, b.w * k, b.h * k);
          ctx.strokeRect(x + b.x * k, y + b.y * k, b.w * k, b.h * k);
        }
        ctx.restore();
      }

      ctx.fillStyle = '#9aa6b4';
      ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n > 1 ? (i === 0 ? 'Front' : 'Back') : 'Each piece', x + pw / 2, y + ph + 17);
    });
  }, [plan, renders, width, n, safety, safe]);

  return (
    <div className="finished">
      <div ref={wrap} className="finished-stage">
        <canvas ref={canvasRef} aria-label="Finished pieces preview" />
      </div>
      <div className="finished-caption">
        <strong>{copies} {unit}</strong> · {fmtSize(plan.out.w, plan.out.h)} · {plan.twoSided ? 'printed both sides' : 'printed one side'}
      </div>
      <div className="legend finished-legend">
        <span><i className="lg lg-safe" /> safe line: keep text {fmtMm(safe)} mm inside</span>
        {problems && <span><i className="lg-box lg-red" /> too close to the edge</span>}
        {!safety && <span className="checking">Checking edges…</span>}
        {safety && !problems && <span className="safe-ok">✓ Nothing too close to the edge</span>}
      </div>
    </div>
  );
}
