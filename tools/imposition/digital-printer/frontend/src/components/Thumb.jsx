import { useEffect, useRef, useState } from 'react';

// One page thumbnail. The dashed line shows where the page will be cut (when it has bleed).
export default function Thumb({ pdf, page, onOpen }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const fullW = page.trimMm.w + 2 * page.bleedMm;
  const fullH = page.trimMm.h + 2 * page.bleedMm;

  useEffect(() => {
    let alive = true;
    pdf
      .render(page.index, 360)
      .then((r) => {
        if (!alive || !ref.current) return;
        const c = ref.current;
        c.width = r.canvas.width;
        c.height = r.canvas.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(r.canvas, 0, 0);
        if (page.bleedMm > 0) drawTrim(ctx, r.rectToPx(page.trimBoxPt));
        setReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pdf, page]);

  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={`Page ${page.index + 1}, tap to view`}>
      <canvas
        ref={ref}
        width={240}
        height={Math.round((240 * fullH) / fullW)}
        className={`thumb-canvas ${ready ? '' : 'thumb-loading'}`}
      />
      <span className="thumb-label">{page.index + 1}</span>
    </button>
  );
}

export function drawTrim(ctx, r) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = Math.max(1, ctx.canvas.width / 300);
  ctx.strokeStyle = 'rgba(0, 170, 230, 0.95)';
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}
