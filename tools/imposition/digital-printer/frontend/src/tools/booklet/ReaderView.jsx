import { useEffect, useRef } from 'react';
import { readerSpreads } from '@engine';

// The booklet (or book) as the reader sees it: cover, then the open spreads, then the back cover.
// Default: a stapled booklet. Pass `items` to show something else:
//   items = [{ sources: [left, right], label }], where each side is a file page index,
//   null = blank page, undefined = nothing there (the outside of a cover).
export default function ReaderView({ plan, pdf, items }) {
  const list = items || bookletItems(plan);
  return (
    <div className="reader">
      {list.map((it, i) => (
        <div key={i} className="reader-item">
          <Spread plan={plan} pdf={pdf} sources={it.sources} />
          <div className="reader-label">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function bookletItems(plan) {
  const spreads = readerSpreads(plan.pages);
  return spreads.map((sp, i) => ({
    sources: sp.map((pos) => (pos === null ? undefined : plan.order[pos])),
    label: i === 0 ? 'Front cover' : i === spreads.length - 1 ? 'Back cover' : `Pages ${sp[0] + 1}–${sp[1] + 1}`,
  }));
}

function Spread({ plan, pdf, sources }) {
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
    sources.forEach((src, side) => {
      const x = side * pw;
      if (src === undefined) return; // nothing on this side
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
    if (sources[0] !== undefined && sources[1] !== undefined) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.moveTo(pw, 0);
      ctx.lineTo(pw, PX);
      ctx.stroke();
    }
    return () => {
      alive = false;
    };
  }, [plan, pdf, sources, w, h]);
  return <canvas ref={ref} className="reader-canvas" />;
}
