import { useEffect, useState } from 'react';
import { fmtMm, fmtSize, round1, getStandard, CARD_PRESETS, PAPER_PRESETS, imageDpi, qualityOf } from '@engine';
import Segmented from '../../components/Segmented.jsx';

const MIN = 5;
const MAX = 2000;

const FIT_OPTIONS = [
  { value: 'fill', label: 'Fill', help: 'Covers the whole piece and keeps the shape. Edges of the design may be cut off.' },
  { value: 'fit', label: 'Fit', help: 'Shows the whole design and keeps the shape. White space may be added.' },
  { value: 'stretch', label: 'Stretch', help: 'Fills the piece exactly, but changes the shape of the design.' },
];

// "Print size": the finished size of each piece. Change it here to resize the design.
export default function PrintSizeCard({ plan, base, onChange, imageInfo }) {
  const original = plan.sides[0].trimMm;
  const out = plan.out;
  const ratio = original.w / original.h;
  const landscape = original.w >= original.h;

  const [open, setOpen] = useState(false);
  const [lock, setLock] = useState(true);
  const [wText, setWText] = useState(fmtMm(out.w));
  const [hText, setHText] = useState(fmtMm(out.h));

  // Keep the boxes in sync when the size changes from somewhere else (presets, reset).
  useEffect(() => {
    setWText((t) => (Number(t) === round1(out.w) ? t : fmtMm(out.w)));
    setHText((t) => (Number(t) === round1(out.h) ? t : fmtMm(out.h)));
  }, [out.w, out.h]);

  const valid = (n) => Number.isFinite(n) && n >= MIN && n <= MAX;

  const setSize = (w, h) => {
    if (Math.abs(w - original.w) < 0.05 && Math.abs(h - original.h) < 0.05) onChange({ size: null });
    else onChange({ size: { w: round1(w), h: round1(h) } });
  };

  const onW = (text) => {
    setWText(text);
    const w = Number(text);
    if (!valid(w)) return;
    const h = lock ? w / ratio : out.h;
    if (!valid(h)) return;
    setSize(w, h);
  };

  const onH = (text) => {
    setHText(text);
    const h = Number(text);
    if (!valid(h)) return;
    const w = lock ? h * ratio : out.w;
    if (!valid(w)) return;
    setSize(w, h);
  };

  const shapeDiffers = Math.abs(out.w / out.h / ratio - 1) > 0.01;

  const toggleLock = () => {
    const next = !lock;
    setLock(next);
    if (next && shapeDiffers) setSize(out.w, out.w / ratio);
  };

  const presets = (Math.max(original.w, original.h) <= 150 ? CARD_PRESETS : PAPER_PRESETS).map(getStandard);
  const pickPreset = (z) => {
    // Turn the preset the same way as the design (landscape design -> landscape size).
    const w = landscape ? z.long : z.short;
    const h = landscape ? z.short : z.long;
    if (Math.abs(w / h / ratio - 1) > 0.01) setLock(false);
    setSize(w, h);
  };
  const isOn = (w, h) => Math.abs(out.w - w) < 0.05 && Math.abs(out.h - h) < 0.05;

  // Picture quality at this size.
  let quality = null;
  if (imageInfo) {
    const dpis = plan.sides.map((p, i) => imageDpi(imageInfo[i], p, plan.fits[i])).filter((d) => d != null);
    const dpi = Math.min(...dpis);
    quality = { dpi, ...qualityOf(dpi) };
  }

  const fitHelp = FIT_OPTIONS.find((o) => o.value === base.fitMode)?.help;

  return (
    <div className="card">
      <div className="ps-head">
        <div className="ps-info">
          <div className="field-label">Print size</div>
          <div className="ps-size">{fmtSize(out.w, out.h)}</div>
          <div className="hint">
            {plan.resized
              ? `Changed from ${fmtSize(original.w, original.h)}${plan.mode !== 'stretch' ? ` · design at ${Math.round(plan.fits[0].scale * 100)}%` : ''}`
              : 'Same as your file'}
          </div>
          {quality && (
            <div className="ps-quality">
              Picture: {quality.dpi} dpi at this size
              <span className={`quality quality-${quality.level}`}>{quality.label}</span>
            </div>
          )}
        </div>
        <button type="button" className="ghost-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Done' : 'Change size'}
        </button>
      </div>

      {open && (
        <div className="ps-body">
          <div className="chips chips-3">
            <button
              type="button"
              className={`chip ${!plan.resized ? 'chip-on' : ''}`}
              onClick={() => {
                setLock(true);
                onChange({ size: null });
              }}
            >
              <span>Original</span>
              <span className="chip-sub">{fmtMm(original.w)} × {fmtMm(original.h)}</span>
            </button>
            {presets.map((z) => {
              const w = landscape ? z.long : z.short;
              const h = landscape ? z.short : z.long;
              return (
                <button key={z.id} type="button" className={`chip ${isOn(w, h) ? 'chip-on' : ''}`} onClick={() => pickPreset(z)}>
                  <span>{z.kind === 'card' ? `${fmtMm(z.long)} × ${fmtMm(z.short)}` : z.name}</span>
                  <span className="chip-sub">{z.kind === 'card' ? 'card' : `${fmtMm(z.short)} × ${fmtMm(z.long)}`}</span>
                </button>
              );
            })}
          </div>

          <div className="ps-inputs">
            <label className="ps-field">
              <span className="hint">Width</span>
              <input className="num" type="number" inputMode="decimal" min={MIN} max={MAX} step="0.5" value={wText} onChange={(e) => onW(e.target.value)} />
            </label>
            <span className="ps-x">×</span>
            <label className="ps-field">
              <span className="hint">Height</span>
              <input className="num" type="number" inputMode="decimal" min={MIN} max={MAX} step="0.5" value={hText} onChange={(e) => onH(e.target.value)} />
            </label>
            <span className="unit ps-unit">mm</span>
          </div>

          <label className="switch-row">
            <span>
              <span className="field-label inline">Keep the shape of my design</span>
              <span className="hint">Change one side and the other follows.</span>
            </span>
            <input type="checkbox" className="switch" checked={lock} onChange={toggleLock} />
          </label>

          {shapeDiffers && (
            <div className="ps-fit">
              <div className="field-label">Your design is a different shape. How should it fit?</div>
              <Segmented options={FIT_OPTIONS} value={base.fitMode} onChange={(v) => onChange({ fitMode: v })} label="How to fit" />
              <div className="hint">{fitHelp}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
