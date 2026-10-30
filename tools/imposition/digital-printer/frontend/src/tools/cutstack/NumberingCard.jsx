import { NUMBER_COLORS, NUMBER_FONTS } from '@engine';
import Segmented from '../../components/Segmented.jsx';

const SIZES = [
  { value: 9, label: 'Small' },
  { value: 12, label: 'Medium' },
  { value: 16, label: 'Large' },
];

// Numbers: where they start, how many, and how they look.
export default function NumberingCard({ plan, numbering, onChange, continueFrom }) {
  const n = plan.numbering;
  const num = (raw, min, max) => {
    const v = Math.floor(Number(raw));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
  };

  return (
    <div className="card">
      <div className="field-label">Numbers</div>
      <div className="number-range">
        <strong>{n.first}</strong> to <strong>{n.last}</strong>
      </div>

      <div className="num-grid">
        <label className="ps-field">
          <span className="hint">Start at</span>
          <input
            className="num"
            type="number"
            inputMode="numeric"
            min="0"
            value={numbering.start}
            onChange={(e) => {
              const v = num(e.target.value, 0, 99999999);
              if (v !== null) onChange({ start: v });
            }}
          />
        </label>
        <label className="ps-field">
          <span className="hint">How many</span>
          <input
            className="num"
            type="number"
            inputMode="numeric"
            min="1"
            value={numbering.count}
            onChange={(e) => {
              const v = num(e.target.value, 1, 100000);
              if (v !== null) onChange({ count: v });
            }}
          />
        </label>
        <label className="ps-field">
          <span className="hint">Digits</span>
          <select
            className="select"
            value={numbering.digits}
            onChange={(e) => onChange({ digits: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}
          >
            <option value="auto">Auto ({n.digits})</option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{d} ({'0'.repeat(Math.max(0, d - 1))}1)</option>
            ))}
          </select>
        </label>
      </div>

      {continueFrom != null && continueFrom !== numbering.start && (
        <button type="button" className="link-btn" onClick={() => onChange({ start: continueFrom })}>
          Continue from your last job: start at {continueFrom}
        </button>
      )}

      <div className="num-grid spaced">
        <label className="ps-field">
          <span className="hint">Before the number</span>
          <input className="num" type="text" maxLength={12} value={numbering.prefix} placeholder="e.g. No. " onChange={(e) => onChange({ prefix: e.target.value })} />
        </label>
        <label className="ps-field">
          <span className="hint">After the number</span>
          <input className="num" type="text" maxLength={12} value={numbering.suffix} placeholder="e.g. /2026" onChange={(e) => onChange({ suffix: e.target.value })} />
        </label>
      </div>

      <div className="field-label spaced">Colour</div>
      <div className="chips chips-3">
        {Object.entries(NUMBER_COLORS).map(([key, c]) => (
          <button key={key} type="button" className={`chip ${numbering.color === key ? 'chip-on' : ''}`} onClick={() => onChange({ color: key })}>
            <span className="swatch" style={{ background: c.css }} aria-hidden />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="field-label spaced">Size and style</div>
      <Segmented options={SIZES} value={SIZES.some((s) => s.value === numbering.size) ? numbering.size : null} onChange={(v) => onChange({ size: v })} label="Number size" />
      <div className="spaced">
        <Segmented
          options={Object.entries(NUMBER_FONTS).map(([value, f]) => ({ value, label: f.label }))}
          value={numbering.font}
          onChange={(v) => onChange({ font: v })}
          label="Number style"
        />
      </div>
      <p className="hint">“Machine” looks like a classic numbering machine. Red is the usual colour for receipt books.</p>
    </div>
  );
}
