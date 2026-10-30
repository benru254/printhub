import { useEffect, useRef, useState } from 'react';
import { clampPosition, withSecondNumber } from '@engine';
import { useWidth } from '../../hooks/useWidth.js';
import { drawPiece } from '../cards/drawPiece.js';
import { drawNumber } from './numberText.js';

const SAFE_COLOR = '#ff4fb0';
const MAX_NUMBERS = 3;

// The finished piece with its number(s). Drag a number, or tap where it should go.
export default function NumberPlacer({ plan, render, onPositions }) {
  const [wrap, width] = useWidth(320);
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState(null); // live positions while dragging
  const geo = useRef({ k: 1, x0: 0, y0: 0 }); // canvas scale, updated on every redraw
  const dragging = useRef(null); // index of the number being dragged (kept apart from geo)
  const latest = useRef(null); // newest positions while dragging

  const { out, numbering, settings } = plan;
  const positions = drag || numbering.positions;
  const box = numbering.box;
  const sel = Math.min(selected, positions.length - 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const pad = 16;
    const maxH = Math.min(420, Math.max(240, window.innerHeight * 0.48));
    const k = Math.min((width - 2 * pad) / out.w, (maxH - 2 * pad) / out.h);
    const cssH = out.h * k + 2 * pad;
    const x0 = (width - out.w * k) / 2;
    const y0 = pad;
    geo.current = { k, x0, y0 };

    canvas.style.width = `${width}px`;
    canvas.style.height = `${Math.round(cssH)}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, cssH);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0, y0, out.w * k, out.h * k);
    ctx.restore();
    drawPiece(ctx, render, plan.fits[0], plan.sides[0], x0, y0, k);

    // Safe line
    const s = settings.safe * k;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = SAFE_COLOR;
    ctx.strokeRect(x0 + s, y0 + s, out.w * k - 2 * s, out.h * k - 2 * s);
    ctx.restore();

    positions.forEach((pos, i) => {
      const cx = x0 + pos.x * k;
      const cy = y0 + pos.y * k;
      drawNumber(ctx, numbering.first, cx, cy, k, numbering);
      ctx.save();
      ctx.setLineDash(i === sel ? [] : [3, 3]);
      ctx.lineWidth = i === sel ? 2 : 1;
      ctx.strokeStyle = i === sel ? '#19b5e6' : 'rgba(25, 181, 230, 0.6)';
      ctx.strokeRect(cx - (box.w / 2) * k - 4, cy - (box.h / 2) * k - 4, box.w * k + 8, box.h * k + 8);
      ctx.restore();
    });
  }, [plan, render, width, positions, sel, out, numbering, settings.safe, box]);

  const toMm = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const { k, x0, y0 } = geo.current;
    return { x: (e.clientX - r.left - x0) / k, y: (e.clientY - r.top - y0) / k };
  };

  const hit = (mm) =>
    positions.findIndex((p) => Math.abs(mm.x - p.x) <= box.w / 2 + 3 && Math.abs(mm.y - p.y) <= box.h / 2 + 3);

  function onDown(e) {
    const mm = toMm(e);
    let i = hit(mm);
    if (i < 0) i = sel; // tap anywhere: move the chosen number there
    setSelected(i);
    const next = positions.map((p, j) => (j === i ? clampPosition(mm, out, box) : p));
    dragging.current = i;
    latest.current = next;
    setDrag(next);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // some browsers refuse capture for synthetic events; dragging still works
    }
  }

  function onMove(e) {
    if (dragging.current == null) return;
    const mm = toMm(e);
    const i = dragging.current;
    const next = (latest.current || positions).map((p, j) => (j === i ? clampPosition(mm, out, box) : p));
    latest.current = next;
    setDrag(next);
  }

  function onUp() {
    if (dragging.current == null) return;
    dragging.current = null;
    if (latest.current) onPositions(latest.current);
    latest.current = null;
    setDrag(null);
  }

  const inset = Math.max(settings.safe, 3) + 1;
  const presets = [
    { label: 'Top right', at: { x: out.w - inset - box.w / 2, y: inset + box.h / 2 } },
    { label: 'Top left', at: { x: inset + box.w / 2, y: inset + box.h / 2 } },
    { label: 'Bottom right', at: { x: out.w - inset - box.w / 2, y: out.h - inset - box.h / 2 } },
    { label: 'Bottom left', at: { x: inset + box.w / 2, y: out.h - inset - box.h / 2 } },
  ];
  const place = (at) => onPositions(positions.map((p, j) => (j === sel ? clampPosition(at, out, box) : p)));

  return (
    <div className="finished">
      <div ref={wrap} className="finished-stage">
        <canvas
          ref={canvasRef}
          className="placer-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Drag the number to where it should be printed"
        />
      </div>
      <p className="finished-caption">Drag the number, or tap where it should go.</p>
      <div className="placer-tools">
        {positions.length > 1 && (
          <div className="placer-pick">
            {positions.map((_, i) => (
              <button key={i} type="button" className={`chip chip-small ${i === sel ? 'chip-on' : ''}`} onClick={() => setSelected(i)}>
                Number {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="chips chips-4">
          {presets.map((p) => (
            <button key={p.label} type="button" className="chip chip-small" onClick={() => place(p.at)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="placer-actions">
          {positions.length < MAX_NUMBERS && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onPositions(withSecondNumber({ ...plan, numbering: { ...numbering, positions } }));
                setSelected(positions.length);
              }}
            >
              + Add the same number again (e.g. ticket stub)
            </button>
          )}
          {positions.length > 1 && (
            <button
              type="button"
              className="link-btn danger-link"
              onClick={() => {
                onPositions(positions.filter((_, j) => j !== sel));
                setSelected(0);
              }}
            >
              Remove number {sel + 1}
            </button>
          )}
        </div>
      </div>
      <div className="legend finished-legend">
        <span><i className="lg lg-safe" /> safe line: keep the number inside</span>
      </div>
    </div>
  );
}
