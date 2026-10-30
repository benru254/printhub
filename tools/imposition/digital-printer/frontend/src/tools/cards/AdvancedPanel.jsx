import { useState } from 'react';
import { fmtMm, isUniform } from '@engine';

// Full control for people who know what they are doing.
// Every field shows AUTO until changed; "Auto" puts it back.
export default function AdvancedPanel({ settings, overrides, setOverrides, onResetTips, printerName, defaults }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const manualCount = Object.keys(overrides).length;
  const pm = settings.printerMargins;

  const fields = [
    {
      key: 'margin',
      label: 'Printer margin',
      step: 0.5,
      help: isUniform(pm)
        ? `From ${printerName}. A number here is used on all sides for this job.`
        : `From ${printerName}: top ${fmtMm(pm.top)}, right ${fmtMm(pm.right)}, bottom ${fmtMm(pm.bottom)}, left ${fmtMm(pm.left)} mm. A number here is used on all sides.`,
    },
    {
      key: 'bleed',
      label: 'Bleed',
      step: 0.5,
      help: `Extra design past the cut line, cut off after printing. Up to ${fmtMm(settings.availBleed)} mm is possible at this size.`,
    },
    { key: 'gap', label: 'Gap between pieces', step: 0.5, help: 'Space between the cut lines of neighbouring pieces.' },
    { key: 'safe', label: 'Safe zone', step: 0.5, help: 'Keep text and logos at least this far inside the cut. 3 mm is standard.' },
  ];

  const setValue = (key, raw) => {
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n) || n < 0 || n > 100) return;
    setOverrides({ ...overrides, [key]: n });
  };
  const toAuto = (key) => {
    const next = { ...overrides };
    delete next[key];
    setOverrides(next);
  };

  const AutoTag = ({ k }) =>
    overrides[k] !== undefined ? (
      <button type="button" className="auto-btn" onClick={() => toAuto(k)}>↺ Auto</button>
    ) : (
      <span className="auto-badge">AUTO</span>
    );

  const saveDefault = () => {
    defaults.save();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="card">
      <button type="button" className="adv-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Advanced settings</span>
        <span className="adv-meta">
          {manualCount > 0 ? `${manualCount} changed` : 'All auto'} {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="adv-body">
          {fields.map((f) => (
            <div className="adv-row" key={f.key}>
              <div className="adv-label">
                <span>{f.label}</span>
                <span className="hint">{f.help}</span>
              </div>
              <div className="adv-control">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={f.step}
                  className="num"
                  value={settings[f.key]}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
                <span className="unit">mm</span>
                <AutoTag k={f.key} />
              </div>
            </div>
          ))}

          <label className="switch-row">
            <span className="adv-label">
              <span>Turn pieces to fit more</span>
              <span className="hint">Rotates pieces 90° when that fits more on the sheet.</span>
            </span>
            <span className="adv-control">
              <input
                type="checkbox"
                className="switch"
                checked={settings.allowRotate}
                onChange={(e) => setOverrides({ ...overrides, allowRotate: e.target.checked })}
              />
              <AutoTag k="allowRotate" />
            </span>
          </label>

          <div className="save-default">
            <div className="field-label">My default</div>
            <p className="hint">
              Start every {defaults.label.toLowerCase()} job on {printerName} with this sheet, direction, cut marks, copies and the advanced settings above.
            </p>
            <div className="save-default-actions">
              <button type="button" className="small-primary" onClick={saveDefault}>
                {saved ? '✓ Saved' : `Save as my default`}
              </button>
              {defaults.exists && (
                <button type="button" className="link-btn" onClick={defaults.forget}>Forget my default</button>
              )}
            </div>
          </div>

          <div className="adv-footer">
            <button type="button" className="link-btn" onClick={() => setOverrides({})} disabled={manualCount === 0}>
              Reset to smart settings
            </button>
            <button type="button" className="link-btn" onClick={onResetTips}>
              Show all tips again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
