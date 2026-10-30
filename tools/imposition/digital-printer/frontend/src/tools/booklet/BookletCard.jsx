import { PAPERS, fmtMm } from '@engine';
import Segmented from '../../components/Segmented.jsx';

const BLANKS = [
  { value: 'before-back', label: 'Before back cover' },
  { value: 'end', label: 'At the very end' },
];

const CREEP = [
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
];

// How many booklets, blank pages, paper and creep.
export default function BookletCard({ plan, booklet, onChange }) {
  return (
    <div className="card">
      <label className="field-label" htmlFor="booklet-copies">How many booklets?</label>
      <input
        id="booklet-copies"
        className="num num-big"
        type="number"
        inputMode="numeric"
        min="1"
        value={booklet.copies}
        onChange={(e) => onChange({ copies: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
      />
      {plan.perSheet > 0 && (
        <div className="copies-result">
          = <strong>{plan.pressSheets} {plan.sheet.label} sheets</strong> (double-sided)
          <span className="hint">
            {' '}· {plan.sets} {plan.sets === 1 ? 'set' : 'sets'} of {plan.sheetCount} · {plan.printedBooklets} booklets printed
          </span>
        </div>
      )}

      <div className="field-label spaced">Pages</div>
      <p className="hint booklet-pages">
        {plan.geometry.pageCount} pages{plan.pad > 0 ? ` + ${plan.pad} blank = ${plan.pages}` : ''} · {plan.sheetCount}{' '}
        {plan.sheetCount === 1 ? 'sheet' : 'sheets'} folded together
      </p>
      {plan.pad > 0 && (
        <>
          <div className="hint">Where should the blank pages go?</div>
          <Segmented options={BLANKS} value={booklet.blanks} onChange={(v) => onChange({ blanks: v })} label="Blank pages" />
        </>
      )}

      <div className="field-label spaced">Paper</div>
      <select className="select wide-select" value={booklet.paper} onChange={(e) => onChange({ paper: Number(e.target.value) })}>
        {PAPERS.map((p) => (
          <option key={p.gsm} value={p.gsm}>{p.label}</option>
        ))}
      </select>

      <div className="field-label spaced">Creep (thick booklets)</div>
      <Segmented options={CREEP} value={booklet.creep === 'off' ? 'off' : 'auto'} onChange={(v) => onChange({ creep: v })} label="Creep" />
      <p className="hint">
        {plan.creepTotal > 0
          ? `Inner pages move up to ${fmtMm(plan.creepTotal)} mm toward the fold, so nothing gets cut off at the edge.`
          : plan.sheetCount < 3 && booklet.creep !== 'off'
            ? 'Not needed for thin booklets.'
            : 'Off: pages stay where they are.'}
      </p>
    </div>
  );
}
