import { useState } from 'react';
import { getSheet, makeCustomSheet, fmtMm } from '@engine';
import Segmented from '../../components/Segmented.jsx';
import { marginText, orderedSheets } from '../../lib/printers.js';

const DIRECTIONS = [
  { value: 'portrait', label: 'Portrait', icon: '▯' },
  { value: 'landscape', label: 'Landscape', icon: '▭' },
];

// Printer, sheet size, sheet direction and cut marks. Every sheet button shows how many fit.
export default function SheetCard({
  base, onChange, counts, customSheets, onAddCustom, onRemoveCustom,
  printers, printer, onPrinter, onManagePrinters,
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', w: '', h: '' });
  const [formError, setFormError] = useState('');
  const ids = orderedSheets(printer.sheets, customSheets);

  const save = () => {
    try {
      const sheet = makeCustomSheet(form);
      onAddCustom(sheet);
      setAdding(false);
      setForm({ label: '', w: '', h: '' });
      setFormError('');
    } catch (e) {
      setFormError(e.message);
    }
  };

  return (
    <div className="card">
      <label className="field-label" htmlFor="printer-select">Printer</label>
      <div className="printer-pick">
        <select id="printer-select" className="select" value={printer.id} onChange={(e) => onPrinter(e.target.value)}>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button type="button" className="ghost-btn" onClick={onManagePrinters}>Edit</button>
      </div>
      <p className="hint">
        {marginText(printer.margins)} · {printer.measured ? 'measured' : 'not measured yet'}
      </p>

      <div className="field-label spaced">Sheet size</div>
      <div className="chips chips-4">
        {ids.map((id) => {
          const s = getSheet(id, customSheets);
          return (
            <div className="chip-wrap" key={id}>
              <button
                type="button"
                className={`chip ${base.sheet === id ? 'chip-on' : ''}`}
                title={`${fmtMm(s.w)} × ${fmtMm(s.h)} mm`}
                onClick={() => onChange({ sheet: id })}
              >
                <span className="chip-name">{s.label}</span>
                <span className="chip-sub">{counts[id] ?? 0} per sheet</span>
              </button>
              {s.custom && (
                <button type="button" className="chip-x" aria-label={`Remove ${s.label}`} onClick={() => onRemoveCustom(id)}>
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className={`chip chip-add ${adding ? 'chip-on' : ''}`} onClick={() => setAdding(!adding)}>
          <span>+ Custom</span>
          <span className="chip-sub">your size</span>
        </button>
      </div>
      <p className="hint">Only sheets this printer can take are shown. Change them under Edit.</p>

      {adding && (
        <div className="custom-form">
          <div className="field-label">Add your own sheet size</div>
          <div className="custom-row">
            <label className="ps-field custom-name">
              <span className="hint">Name (optional)</span>
              <input className="num" type="text" maxLength={14} placeholder="e.g. 13×19" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </label>
            <label className="ps-field">
              <span className="hint">Width mm</span>
              <input className="num" type="number" inputMode="decimal" value={form.w} onChange={(e) => setForm({ ...form, w: e.target.value })} />
            </label>
            <label className="ps-field">
              <span className="hint">Height mm</span>
              <input className="num" type="number" inputMode="decimal" value={form.h} onChange={(e) => setForm({ ...form, h: e.target.value })} />
            </label>
          </div>
          {formError && <p className="error">{formError}</p>}
          <div className="custom-actions">
            <button type="button" className="ghost-btn" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="small-primary" onClick={save}>Save size</button>
          </div>
          <p className="hint">Saved on this device and added to {printer.name}.</p>
        </div>
      )}

      <div className="field-label spaced">Sheet direction</div>
      <Segmented options={DIRECTIONS} value={base.orientation} onChange={(v) => onChange({ orientation: v })} label="Sheet direction" />

      <label className="switch-row spaced">
        <span>
          <span className="field-label inline">Cut marks</span>
          <span className="hint">Lines that show where to cut</span>
        </span>
        <input type="checkbox" className="switch" checked={base.marks} onChange={(e) => onChange({ marks: e.target.checked })} />
      </label>
    </div>
  );
}
