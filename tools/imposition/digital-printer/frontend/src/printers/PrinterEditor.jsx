import { useState } from 'react';
import { buildMarginTestPdf, getSheet, orientSheet, isUniform, toMargins, flipEdgeName } from '@engine';
import Segmented from '../components/Segmented.jsx';
import { allSheetIds, orderedSheets } from '../lib/printers.js';
import { downloadBytes } from '../lib/download.js';

const SIDES = ['top', 'right', 'bottom', 'left'];

const FLIPS = [
  { value: 'book', label: 'Like a book page' },
  { value: 'calendar', label: 'Like a calendar' },
];

const DIRECTIONS = [
  { value: 'portrait', label: 'Portrait', icon: '▯' },
  { value: 'landscape', label: 'Landscape', icon: '▭' },
];

const toText = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// Edit one printer: name, real margins (with test sheet), sheets, double-sided.
export default function PrinterEditor({ printer, customSheets, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState(printer);
  const [same, setSame] = useState(isUniform(printer.margins));
  const [text, setText] = useState(() => Object.fromEntries(SIDES.map((s) => [s, toText(printer.margins[s])])));
  const [testSheet, setTestSheet] = useState(printer.defaultSheet);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const ids = allSheetIds(customSheets);

  function setMargin(side, value) {
    const next = same ? Object.fromEntries(SIDES.map((s) => [s, value])) : { ...text, [side]: value };
    setText(next);
    set({ measured: true }); // typing real numbers means they were measured
  }

  function toggleSame() {
    if (!same) setText(Object.fromEntries(SIDES.map((s) => [s, text.top])));
    setSame(!same);
  }

  function toggleSheet(id) {
    const on = draft.sheets.includes(id);
    if (on && draft.sheets.length === 1) return; // keep at least one sheet
    const sheets = on ? draft.sheets.filter((x) => x !== id) : [...draft.sheets, id];
    set({ sheets, defaultSheet: sheets.includes(draft.defaultSheet) ? draft.defaultSheet : sheets[0] });
  }

  function save() {
    const bad = SIDES.find((s) => text[s] === '' || Number.isNaN(Number(text[s])) || Number(text[s]) < 0 || Number(text[s]) > 50);
    if (bad) {
      setError(`The ${bad} margin must be a number from 0 to 50 mm.`);
      return;
    }
    if (!String(draft.name).trim()) {
      setError('Give the printer a name, for example "Konica A3" or "Office printer".');
      return;
    }
    onSave({ ...draft, margins: toMargins(Object.fromEntries(SIDES.map((s) => [s, Number(text[s])]))) });
  }

  async function downloadTest() {
    const sheet = orientSheet(getSheet(testSheet, customSheets), 'portrait');
    const bytes = await buildMarginTestPdf({ sheet, flip: draft.flip });
    downloadBytes(bytes, `margin-test_${sheet.label}.pdf`);
  }

  const allowed = orderedSheets(draft.sheets, customSheets);

  return (
    <div className="editor">
      <div className="card">
        <label className="field-label" htmlFor="printer-name">Name</label>
        <input id="printer-name" className="num wide" type="text" maxLength={40} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Konica A3" />
      </div>

      <div className="card">
        <div className="field-label">Margins it can’t print on</div>
        <p className="hint">Every printer leaves a small white edge. Measure it once with the test sheet and every layout will be exact.</p>

        <div className="test-sheet">
          <div className="test-sheet-row">
            <select className="select" value={testSheet} onChange={(e) => setTestSheet(e.target.value)} aria-label="Test sheet size">
              {allowed.map((id) => (
                <option key={id} value={id}>{getSheet(id, customSheets).label}</option>
              ))}
            </select>
            <button type="button" className="small-primary" onClick={downloadTest}>Download test sheet</button>
          </div>
          <p className="hint">
            Print it at <strong className="em">100% (Actual size)</strong>, never “Fit to page”. On each side the first line you can see is the margin in mm.
          </p>
        </div>

        <label className="switch-row">
          <span className="field-label inline">Same on all sides</span>
          <input type="checkbox" className="switch" checked={same} onChange={toggleSame} />
        </label>

        {same ? (
          <div className="margin-grid margin-one">
            <label className="ps-field">
              <span className="hint">All sides (mm)</span>
              <input className="num" type="number" inputMode="decimal" min="0" max="50" step="0.5" value={text.top} onChange={(e) => setMargin('top', e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="margin-grid">
            {SIDES.map((s) => (
              <label key={s} className={`ps-field margin-${s}`}>
                <span className="hint">{s[0].toUpperCase() + s.slice(1)} (mm)</span>
                <input className="num" type="number" inputMode="decimal" min="0" max="50" step="0.5" value={text[s]} onChange={(e) => setMargin(s, e.target.value)} />
              </label>
            ))}
            <div className="margin-paper" aria-hidden>sheet</div>
          </div>
        )}

        <label className="switch-row">
          <span>
            <span className="field-label inline">Measured with the test sheet</span>
            <span className="hint">Turn off if these are only a guess. We will remind you to measure.</span>
          </span>
          <input type="checkbox" className="switch" checked={!!draft.measured} onChange={(e) => set({ measured: e.target.checked })} />
        </label>
      </div>

      <div className="card">
        <div className="field-label">Sheet sizes this printer can take</div>
        <div className="chips chips-4">
          {ids.map((id) => {
            const on = draft.sheets.includes(id);
            return (
              <button key={id} type="button" className={`chip ${on ? 'chip-on' : ''}`} onClick={() => toggleSheet(id)} aria-pressed={on}>
                <span className="chip-name">{getSheet(id, customSheets).label}</span>
                <span className="chip-sub">{on ? '✓ yes' : 'no'}</span>
              </button>
            );
          })}
        </div>

        <div className="field-label spaced">Usual sheet</div>
        <div className="chips chips-4">
          {allowed.map((id) => (
            <button key={id} type="button" className={`chip ${draft.defaultSheet === id ? 'chip-on' : ''}`} onClick={() => set({ defaultSheet: id })}>
              <span className="chip-name">{getSheet(id, customSheets).label}</span>
            </button>
          ))}
        </div>
        <div className="spaced">
          <Segmented options={DIRECTIONS} value={draft.orientation} onChange={(v) => set({ orientation: v })} label="Usual direction" />
        </div>
      </div>

      <div className="card">
        <label className="switch-row">
          <span>
            <span className="field-label inline">Prints both sides by itself</span>
            <span className="hint">Turn off if you put the paper back in by hand for the back side.</span>
          </span>
          <input type="checkbox" className="switch" checked={draft.duplex} onChange={(e) => set({ duplex: e.target.checked })} />
        </label>

        <div className="field-label spaced">For the back side, the sheet turns</div>
        <Segmented options={FLIPS} value={draft.flip} onChange={(v) => set({ flip: v })} label="Back side turns" />
        <p className="hint">
          {draft.flip === 'book'
            ? `Left to right, like turning a book page. In the print window this is “Flip on ${flipEdgeName('book', 'portrait')}” for portrait sheets.`
            : `Top to bottom, like a wall calendar. In the print window this is “Flip on ${flipEdgeName('calendar', 'portrait')}” for portrait sheets.`}{' '}
          If unsure, print the test sheet double-sided: the circles should line up.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="editor-actions">
        {onDelete &&
          (confirmDelete ? (
            <button type="button" className="danger-btn" onClick={onDelete}>Tap again to delete</button>
          ) : (
            <button type="button" className="link-btn danger-link" onClick={() => setConfirmDelete(true)}>Delete printer</button>
          ))}
        <span className="spacer" />
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="small-primary" onClick={save}>Save printer</button>
      </div>
    </div>
  );
}
