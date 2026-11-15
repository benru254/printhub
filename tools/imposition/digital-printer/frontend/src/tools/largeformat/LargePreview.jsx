import { useEffect, useRef } from 'react';

const MAX_W = 620;
const MAX_H = 560;

// Draws the whole print: the design at its finished size, the hem or trim area around it,
// where the parts join, and where the eyelets go. Same plan as the PDF (engine planLargeFormat).
export default function LargePreview({ plan, render }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { print, finished, extra, fit, page } = plan;
    const S = Math.min(MAX_W / print.w, MAX_H / print.h);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(print.w * S * dpr);
    c.height = Math.round(print.h * S * dpr);
    c.style.aspectRatio = `${print.w} / ${print.h}`;
    const g = c.getContext('2d');
    g.setTransform(S * dpr, 0, 0, S * dpr, 0, 0); // draw in mm
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, print.w, print.h);

    const fx = extra.left;
    const fy = extra.top;
    const cx = fx + finished.w / 2;
    const cy = fy + finished.h / 2;

    if (render) {
      // The page's trim box, scaled by the fit, centred on the finished size.
      const t = render.rectToPx(page.trimBoxPt);
      const kx = (page.trimMm.w * fit.sx) / t.w;
      const ky = (page.trimMm.h * fit.sy) / t.h;
      const draw = () => g.drawImage(render.canvas, cx - (t.x + t.w / 2) * kx, cy - (t.y + t.h / 2) * ky, render.canvas.width * kx, render.canvas.height * ky);
      if (plan.fill === 'mirror') {
        for (const dx of [-1, 0, 1]) {
          for (const dy of [-1, 0, 1]) {
            if (!dx && !dy) continue;
            // A copy of the design, flipped about its own centre, next to the finished size.
            const tx = cx + dx * finished.w;
            const ty = cy + dy * finished.h;
            g.save();
            g.beginPath();
            g.rect(tx - finished.w / 2, ty - finished.h / 2, finished.w, finished.h);
            g.clip();
            g.translate(tx, ty);
            g.scale(dx ? -1 : 1, dy ? -1 : 1);
            g.translate(-tx, -ty);
            g.translate(dx * finished.w, dy * finished.h);
            draw();
            g.restore();
          }
        }
      }
      g.save();
      g.beginPath();
      const b = plan.artBleed;
      g.rect(fx - b, fy - b, finished.w + 2 * b, finished.h + 2 * b);
      g.clip();
      draw();
      g.restore();
    }

    const px = 1 / S; // one screen pixel in mm
    // The hem / trim area, slightly dimmed so the finished size stands out.
    g.fillStyle = 'rgba(15, 18, 22, 0.35)';
    g.fillRect(0, 0, print.w, extra.top);
    g.fillRect(0, fy + finished.h, print.w, extra.bottom);
    g.fillRect(0, fy, extra.left, finished.h);
    g.fillRect(fx + finished.w, fy, extra.right, finished.h);
    g.strokeStyle = '#00aae6';
    g.lineWidth = 2 * px;
    g.setLineDash([8 * px, 5 * px]);
    g.strokeRect(fx, fy, finished.w, finished.h);

    // Where the parts join: the overlap is shaded.
    g.setLineDash([]);
    for (const p of plan.panels) {
      g.fillStyle = 'rgba(230, 0, 126, 0.22)';
      if (p.col > 0) g.fillRect(p.x, 0, plan.overlap, print.h);
      if (p.row > 0) g.fillRect(0, p.y, print.w, plan.overlap);
      g.strokeStyle = '#e6007e';
      g.lineWidth = 2 * px;
      if (p.col > 0) {
        g.beginPath();
        g.moveTo(p.x + plan.overlap / 2, 0);
        g.lineTo(p.x + plan.overlap / 2, print.h);
        g.stroke();
      }
      if (p.row > 0) {
        g.beginPath();
        g.moveTo(0, p.y + plan.overlap / 2);
        g.lineTo(print.w, p.y + plan.overlap / 2);
        g.stroke();
      }
    }

    // Eyelets, drawn big enough to see on a phone.
    const r = Math.max(5, 4 * px);
    for (const e of plan.eyelets) {
      g.beginPath();
      g.arc(fx + e.x, fy + e.y, r, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.strokeStyle = '#111111';
      g.lineWidth = 1.5 * px;
      g.stroke();
    }
  }, [plan, render]);

  return (
    <div className="preview-wrap">
      <canvas ref={ref} className="preview-canvas lf-canvas" aria-label="Preview of the whole print" />
    </div>
  );
}
