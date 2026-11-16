// Small pieces of the order screen: choosing a size, typing your own size, option buttons.
import { useState } from 'react';
import { productSizes, sizeText, SHEET_SIZE_LIMITS, AREA_SIZE_LIMITS } from '@engine';

const MM = { m: 1000, cm: 10, mm: 1, ft: 304.8, in: 25.4 };
const UNIT_NAMES = { m: 'metres', cm: 'cm', mm: 'mm', ft: 'feet', in: 'inches' };

const show = (mm, unit) => String(Math.round((mm / MM[unit]) * 100) / 100);

// One row of choice buttons. options = [{ value, label, sub? }]
export function Choice({ label, options, value, onChange, columns }) {
  const cols = columns || Math.min(3, options.length);
  return (
    <div className="chips" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={`chip ${value === o.value ? 'chip-on' : ''}`} onClick={() => onChange(o.value)}>
          <span className="chip-name">{o.label}</span>
          {o.sub && <span className="chip-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

// The product's sizes as buttons, plus "Other size" when the product allows any size.
// Banners are typed in metres or feet, small things in cm, mm or inches: the way people say them.
export function SizePicker({ product, choice, onChange }) {
  const sizes = productSizes(product);
  const area = product.kind === 'area';
  const units = area ? ['m', 'cm', 'ft'] : ['cm', 'mm', 'in'];
  const limits = area ? AREA_SIZE_LIMITS : SHEET_SIZE_LIMITS;
  const [unit, setUnit] = useState(units[0]);
  const [w, setW] = useState(() => show(choice.w, units[0]));
  const [h, setH] = useState(() => show(choice.h, units[0]));
  const own = choice.size === 'custom';

  function type(nextW, nextH, nextUnit = unit) {
    setW(nextW);
    setH(nextH);
    const mmW = Number(nextW) * MM[nextUnit];
    const mmH = Number(nextH) * MM[nextUnit];
    if (mmW >= limits.min && mmW <= limits.max && mmH >= limits.min && mmH <= limits.max) onChange({ size: 'custom', w: mmW, h: mmH });
  }
  const typedW = Number(w) * MM[unit];
  const typedH = Number(h) * MM[unit];
  const bad = own && !(typedW >= limits.min && typedW <= limits.max && typedH >= limits.min && typedH <= limits.max);

  if (sizes.length === 1 && !product.customSize) return <p className="fixed-size">{sizes[0].name}</p>;

  return (
    <div>
      <div className="chips size-chips" role="radiogroup" aria-label="Size">
        {sizes.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={choice.size === s.id} className={`chip ${choice.size === s.id ? 'chip-on' : ''}`} onClick={() => onChange({ size: s.id })}>
            <span className="chip-name">{s.name}</span>
          </button>
        ))}
        {product.customSize && (
          <button
            type="button"
            role="radio"
            aria-checked={own}
            className={`chip ${own ? 'chip-on' : ''}`}
            onClick={() => {
              setW(show(choice.w, unit));
              setH(show(choice.h, unit));
              onChange({ size: 'custom', w: choice.w, h: choice.h });
            }}
          >
            <span className="chip-name">Other size</span>
          </button>
        )}
      </div>
      {own && (
        <div className="own-size">
          <label>
            <span className="hint">Width</span>
            <input className="num" type="number" inputMode="decimal" min="0" step="any" value={w} onChange={(e) => type(e.target.value, h)} aria-label="Width" />
          </label>
          <span className="own-x" aria-hidden>×</span>
          <label>
            <span className="hint">Height</span>
            <input className="num" type="number" inputMode="decimal" min="0" step="any" value={h} onChange={(e) => type(w, e.target.value)} aria-label="Height" />
          </label>
          <label>
            <span className="hint">in</span>
            <select
              className="select"
              aria-label="Unit"
              value={unit}
              onChange={(e) => {
                // The same real size, shown in the new unit.
                const next = e.target.value;
                setUnit(next);
                setW(show(choice.w, next));
                setH(show(choice.h, next));
              }}
            >
              {units.map((u) => <option key={u} value={u}>{UNIT_NAMES[u]}</option>)}
            </select>
          </label>
          {bad ? (
            <p className="error own-note">Type a size between {sizeText(limits.min, limits.min)} and {area ? '50 m' : sizeText(limits.max, limits.max)}.</p>
          ) : (
            <p className="hint own-note">= {sizeText(Math.round(choice.w), Math.round(choice.h))}</p>
          )}
        </div>
      )}
    </div>
  );
}
