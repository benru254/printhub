import { useEffect, useRef, useState } from 'react';
import { fmtSize } from '@engine';
import { drawTrim } from './Thumb.jsx';

// Full-screen view of one page, with previous / next.
export default function PageViewer({ pdf, pages, index, onIndex, onClose }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);
  const page = pages[index];
  const last = pages.length - 1;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < last) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, last, onClose, onIndex]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const px = Math.min(2000, Math.round(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)));
    pdf
      .render(index, px)
      .then((r) => {
        if (!alive || !ref.current) return;
        const c = ref.current;
        c.width = r.canvas.width;
        c.height = r.canvas.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(r.canvas, 0, 0);
        if (page.bleedMm > 0) drawTrim(ctx, r.rectToPx(page.trimBoxPt));
        setLoading(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pdf, index, page]);

  const stop = (e) => e.stopPropagation();

  return (
    <div className="viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="viewer-top" onClick={stop}>
        <span>
          Page {index + 1} of {pages.length} · {fmtSize(page.trimMm.w, page.trimMm.h)}
        </span>
        <button type="button" className="viewer-btn" onClick={onClose}>✕ Close</button>
      </div>
      <div className="viewer-stage">
        <canvas ref={ref} className={`viewer-canvas ${loading ? 'thumb-loading' : ''}`} onClick={stop} />
      </div>
      <div className="viewer-bottom" onClick={stop}>
        <button type="button" className="viewer-btn" disabled={index === 0} onClick={() => onIndex(index - 1)}>‹ Previous</button>
        <span className="viewer-hint">{page.bleedMm > 0 ? 'Dashed line = where it will be cut' : ''}</span>
        <button type="button" className="viewer-btn" disabled={index === last} onClick={() => onIndex(index + 1)}>Next ›</button>
      </div>
    </div>
  );
}
