import { PAPERS, COVER_PAPERS, SIGNATURE_SIZES, fmtMm } from '@engine';
import Segmented from '../../components/Segmented.jsx';

const CREEP = [
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
];

// How many books, signatures, papers, spine milling and spine title.
export default function BookCard({ plan, book, onChange }) {
  return (
    <div className="card">
      <label className="field-label" htmlFor="book-copies">How many books?</label>
      <input
        id="book-copies"
        className="num num-big"
        type="number"
        inputMode="numeric"
        min="1"
        value={book.copies}
        onChange={(e) => onChange({ copies: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
      />
      {plan.perSheet > 0 && (
        <div className="copies-result">
          = <strong>{plan.pressSheets} {plan.sheet.label} sheets</strong> (double-sided)
          {plan.cover.enabled && plan.cover.layout && (
            <> + <strong>{plan.coverSets} cover {plan.coverSets === 1 ? 'sheet' : 'sheets'}</strong></>
          )}
          <span className="hint"> · {plan.printedBooklets} books printed</span>
        </div>
      )}

      <label className="switch-row spaced">
        <span>
          <span className="field-label inline">First and last page are the cover</span>
          <span className="hint">Turn off if the cover is a separate file.</span>
        </span>
        <input type="checkbox" className="switch" checked={!!book.coverFromFile} onChange={(e) => onChange({ coverFromFile: e.target.checked })} />
      </label>

      <div className="field-label spaced">Inside pages</div>
      <p className="hint booklet-pages">
        {plan.insidePages} pages{plan.pad > 0 ? ` + ${plan.pad} blank = ${plan.pages}` : ''} · spine{' '}
        <strong>{fmtMm(plan.spine)} mm</strong>
      </p>

      <div className="field-label spaced">Pages per signature</div>
      <div className="chips chips-4">
        {SIGNATURE_SIZES.map((n) => (
          <button key={n} type="button" className={`chip ${plan.signature === n ? 'chip-on' : ''}`} onClick={() => onChange({ signature: n })}>
            <span>{n}</span>
          </button>
        ))}
      </div>
      <p className="hint">
        {plan.signatures.length} {plan.signatures.length === 1 ? 'signature' : 'signatures'} of {plan.signature / 4}{' '}
        {plan.signature === 4 ? 'sheet' : 'sheets'} folded together. 16 is usual; use 4 or 8 for thick paper.
      </p>

      <div className="field-label spaced">Inside paper</div>
      <select className="select wide-select" value={book.paper} onChange={(e) => onChange({ paper: Number(e.target.value) })}>
        {PAPERS.map((p) => (
          <option key={p.gsm} value={p.gsm}>{p.label}</option>
        ))}
      </select>

      {book.coverFromFile && (
        <>
          <div className="field-label spaced">Cover paper</div>
          <select className="select wide-select" value={book.coverPaper} onChange={(e) => onChange({ coverPaper: Number(e.target.value) })}>
            {COVER_PAPERS.map((p) => (
              <option key={p.gsm} value={p.gsm}>{p.label}</option>
            ))}
          </select>

          <label className="field-label spaced" htmlFor="book-spine">Title on the spine</label>
          <input
            id="book-spine"
            className="num wide-select"
            type="text"
            maxLength={60}
            placeholder={plan.spine >= 4 ? 'e.g. Annual Report 2026' : 'Spine too thin for text'}
            disabled={plan.spine < 4}
            value={book.spineText}
            onChange={(e) => onChange({ spineText: e.target.value })}
          />
        </>
      )}

      <div className="field-label spaced">Spine milling</div>
      <div className="chips chips-4">
        {[0, 1, 2, 3].map((g) => (
          <button key={g} type="button" className={`chip ${plan.grind === g ? 'chip-on' : ''}`} onClick={() => onChange({ grind: g })}>
            <span>{g === 0 ? 'None' : `${g} mm`}</span>
          </button>
        ))}
      </div>
      <p className="hint">Only if your binder mills (grinds) the spine before gluing. Ask them; 2–3 mm is common.</p>

      <div className="field-label spaced">Creep</div>
      <Segmented options={CREEP} value={book.creep === 'off' ? 'off' : 'auto'} onChange={(v) => onChange({ creep: v })} label="Creep" />
      <p className="hint">
        {plan.creepTotal > 0 ? `Inner sheets of each signature move up to ${fmtMm(plan.creepTotal)} mm toward the fold.` : 'Not needed for these signatures.'}
      </p>
    </div>
  );
}
