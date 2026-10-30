import { useEffect, useRef } from 'react';
import { readerSpreads } from '@engine';

// The booklet as the reader sees it: cover, then the open spreads, then the back cover.
export default function ReaderView({ plan, pdf }) {
  const spreads = readerSpreads(plan.pages);
  return (
    <div className="reader">
      {spreads.map((sp, i) => (
        <div key={i} className="reader-item">
          <Spread plan={plan} pdf={pdf} positions={sp} />
          <div className="reader-label">
            {i === 0 ? 'Front cover' : i === spreads.length - 1 ? 'Back cover' : `Pages ${sp[0] + 1}–${sp[1] + 1}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function Spread({ plan, pdf, positions }) {
  const ref = useRef(null);
  const { w, h } = plan.page;
  useEffect(() => {
    let alive = true;
    const canvas = ref.current;
    const PX = 150; // pixels per page height
    const k = PX / h;
    const pw = Math.round(w * k);
    canvas.width = pw * 2;
    canvas.height = PX;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    positions.forEach((pos, side) => {
      const x = side * pw;
      if (pos === null) return; // nothing on this side (outside of a cover)
      const src = plan.order[pos];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, 0, pw, PX);
      if (src === null) {
        ctx.fillStyle = '#9aa6b4';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Blank', x + pw / 2, PX / 2 + 4);
        return;
      }
      const page = plan.geometry.pages[src];
      pdf
        .render(src, 300)
        .then((r) => {
          if (!alive) return;
          const s = r.rectToPx(page.trimBoxPt);
          ctx.drawImage(r.canvas, s.x, s.y, s.w, s.h, x, 0, pw, PX);
        })
        .catch(() => {});
    });
    // Fold line
    if (positions[0] !== null && positions[1] !== null) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.moveTo(pw, 0);
      ctx.lineTo(pw, PX);
      ctx.stroke();
    }
    return () => {
      alive = false;
    };
  }, [plan, pdf, positions, w, h]);
  return <canvas ref={ref} className="reader-canvas" />;
}
