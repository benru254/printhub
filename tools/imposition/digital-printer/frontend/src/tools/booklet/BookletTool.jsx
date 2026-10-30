import { useEffect, useMemo, useRef, useState } from 'react';
import {
  planBooklet, getBookletWarnings, buildBookletPdf, cardStartState, makeSavedDefault, defaultKey,
  orientSheet, getSheet, BOOKLET_DEFAULTS, fmtSize, fmtMm, matchStandard,
} from '@engine';
import { store } from '../../lib/storage.js';
import { downloadBytes } from '../../lib/download.js';
import Segmented from '../../components/Segmented.jsx';
import TutorNote from '../../components/TutorNote.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import SheetCard from '../cards/SheetCard.jsx';
import AdvancedPanel from '../cards/AdvancedPanel.jsx';
import BookletCard from './BookletCard.jsx';
import ReaderView from './ReaderView.jsx';
import BookletSheetPreview from './BookletSheetPreview.jsx';

const VIEWS = [
  { value: 'reader', label: 'Booklet pages' },
  { value: 'sheet', label: 'Print sheets' },
];

const KEY_KIND = 'booklet';

// Saddle-stitched booklets: pages in fold order, blanks, creep, best sheet.
export default function BookletTool({
  job, onBack, onFiles, busy, loadError, tips,
  customSheets, onAddCustomSheet, onRemoveCustomSheet,
  printers, printer, onPrinter, onManagePrinters,
}) {
  const { geometry, pdf } = job;
  const savedDefault = (p) => store.get('cardDefaults', {})[defaultKey(p.id, KEY_KIND)] || null;

  // Start on the printer's sheet, or on the best sheet for this booklet when that doesn't fit at full size.
  const startFor = (p) => {
    const saved = savedDefault(p);
    const s = cardStartState(p, saved);
    if (!saved) {
      const trial = planBooklet({ geometry, base: s.base, overrides: s.overrides, customSheets, printer: p });
      // Use less paper: e.g. 2 A5 booklets per SRA3 sheet instead of 1 per A3.
      const paperNow = trial.perSheet ? (trial.sheet.w * trial.sheet.h) / trial.perSheet : Infinity;
      if (trial.best && (trial.scale < 0.999 || trial.best.paper < paperNow * 0.8)) {
        s.base = { ...s.base, sheet: trial.best.id, orientation: trial.best.orientation };
      }
    }
    return s;
  };

  const [start] = useState(() => startFor(printer));
  const [base, setBase] = useState(start.base);
  const [overrides, setOverrides] = useState(start.overrides);
  const [booklet, setBooklet] = useState(() => ({ ...BOOKLET_DEFAULTS, ...store.get('bookletStyle', {}) }));
  const [view, setView] = useState('reader');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [side, setSide] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [jobDismissed, setJobDismissed] = useState([]);
  const [hasDefault, setHasDefault] = useState(() => !!savedDefault(printer));

  const lastPrinter = useRef(printer.id);
  useEffect(() => {
    if (lastPrinter.current === printer.id) return;
    lastPrinter.current = printer.id;
    const s = startFor(printer);
    setBase(s.base);
    setOverrides(s.overrides);
    setHasDefault(!!savedDefault(printer));
    setView('sheet');
  }, [printer]); // eslint-disable-line react-hooks/exhaustive-deps

  const safeBase = printer.sheets.includes(base.sheet) ? base : { ...base, sheet: printer.defaultSheet };
  const plan = useMemo(
    () => planBooklet({ geometry, base: safeBase, overrides, customSheets, printer, booklet }),
    [geometry, safeBase, overrides, customSheets, printer, booklet]
  );

  // Spreads that fit on each sheet size (full size), for the sheet buttons.
  const counts = useMemo(() => {
    const out = {};
    for (const id of printer.sheets) out[id] = plan.layoutFor(orientSheet(getSheet(id, customSheets), safeBase.orientation)).count;
    return out;
  }, [plan, printer.sheets, customSheets, safeBase.orientation]);

  const shownSheet = Math.min(sheetIndex, plan.sheetCount - 1);
  const isBack = side === 1;

  // Pages needed for the sheet being shown.
  const [renders, setRenders] = useState(new Map());
  useEffect(() => {
    let alive = true;
    const info = plan.sheetsInfo[shownSheet];
    const wanted = [...info.front, ...info.back].map((pos) => plan.order[pos]).filter((i) => i !== null);
    Promise.all(wanted.map((i) => pdf.render(i, 700).then((r) => [i, r])))
      .then((list) => alive && setRenders(new Map(list)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pdf, plan, shownSheet]);

  const notes = getBookletWarnings({ plan }).filter((n) => !tips.dismissed.includes(n.id) && !jobDismissed.includes(n.id));
  function dismiss(id) {
    const note = notes.find((n) => n.id === id);
    if (note && note.learn) tips.dismiss(id);
    else setJobDismissed((list) => [...list, id]);
  }

  function update(patch) {
    setBase({ ...safeBase, ...patch });
    setView('sheet');
  }

  function changeBooklet(patch) {
    const next = { ...booklet, ...patch };
    setBooklet(next);
    store.set('bookletStyle', { blanks: next.blanks, paper: next.paper, creep: next.creep });
    if ('blanks' in patch) setSheetIndex(0);
  }

  const defaults = {
    label: 'Booklets',
    exists: hasDefault,
    save() {
      const all = store.get('cardDefaults', {});
      all[defaultKey(printer.id, KEY_KIND)] = makeSavedDefault(safeBase, overrides);
      store.set('cardDefaults', all);
      setHasDefault(true);
    },
    forget() {
      const all = store.get('cardDefaults', {});
      delete all[defaultKey(printer.id, KEY_KIND)];
      store.set('cardDefaults', all);
      setHasDefault(false);
    },
  };

  async function download() {
    setDownloading(true);
    setError('');
    try {
      const bytes = await buildBookletPdf({ sourceBytes: job.bytes, plan, title: `${job.name} - booklet` });
      downloadBytes(bytes, `${job.name}_booklet_${plan.pages}pp_${plan.perSheet}up_${plan.sheet.label}${plan.sheet.orientation === 'landscape' ? '-L' : ''}.pdf`);
    } catch (e) {
      setError(e.message || 'Could not build the PDF.');
    } finally {
      setDownloading(false);
    }
  }

  const std = matchStandard(plan.page.w, plan.page.h);
  const sheetName = `${plan.sheet.label}${plan.sheet.orientation === 'landscape' ? ' landscape' : ''}`;

  return (
    <main className="tool-screen">
      <div className="toolbar">
        <button type="button" className="back-btn" onClick={onBack}>‹ Your file</button>
        <span className="toolbar-title">Booklet</span>
      </div>

      <div className="work">
        <section className="preview-col">
          <div className="summary">
            <div className="summary-main">
              {std ? `${std.name} booklet` : 'Booklet'}, {plan.pages} pages:{' '}
              {plan.perSheet > 0 ? (
                <strong>
                  {plan.sheetCount} {plan.sheetCount === 1 ? 'sheet' : 'sheets'}, {plan.perSheet} per {sheetName}
                </strong>
              ) : (
                <strong>doesn’t fit on {sheetName}</strong>
              )}
            </div>
            <div className="summary-sub">
              {fmtSize(plan.out.w, plan.out.h)} per page
              {plan.scale < 0.999 ? ` (shrunk to ${Math.round(plan.scale * 100)}%)` : ''}
              {plan.settings.bleedUsed > 0 ? ` · ${fmtMm(plan.settings.bleedUsed)} mm bleed` : ' · no bleed'}
              {plan.creepTotal > 0 ? ` · creep ${fmtMm(plan.creepTotal)} mm` : ''}
              {` · ${printer.name}`}
            </div>
          </div>

          <Segmented options={VIEWS} value={view} onChange={setView} label="Preview" />

          {view === 'reader' ? (
            <ReaderView plan={plan} pdf={pdf} />
          ) : (
            <>
              <div className="sheet-stepper">
                <button type="button" className="viewer-btn" disabled={shownSheet === 0} onClick={() => setSheetIndex(shownSheet - 1)}>‹</button>
                <span>Sheet {shownSheet + 1} of {plan.sheetCount}</span>
                <button type="button" className="viewer-btn" disabled={shownSheet >= plan.sheetCount - 1} onClick={() => setSheetIndex(shownSheet + 1)}>›</button>
              </div>
              <Segmented options={[{ value: 0, label: 'Front' }, { value: 1, label: 'Back' }]} value={side} onChange={setSide} label="Side" />
              <BookletSheetPreview plan={plan} sheetIndex={shownSheet} isBack={isBack} renders={renders} />
              <div className="legend">
                <span><i className="lg lg-cut" /> fold and trim lines</span>
                <span>Big numbers = page numbers in the booklet</span>
              </div>
            </>
          )}
        </section>

        <section className="controls-col">
          <BookletCard plan={plan} booklet={booklet} onChange={changeBooklet} />

          {notes.length > 0 && (
            <div className="notes">
              {notes.map((n) => (
                <TutorNote key={n.id} note={n} onDismiss={dismiss} />
              ))}
            </div>
          )}

          <SheetCard
            base={safeBase}
            onChange={update}
            counts={counts}
            customSheets={customSheets}
            onAddCustom={(s) => {
              onAddCustomSheet(s);
              update({ sheet: s.id });
            }}
            onRemoveCustom={(id) => {
              onRemoveCustomSheet(id);
              if (safeBase.sheet === id) update({ sheet: printer.defaultSheet });
            }}
            printers={printers}
            printer={printer}
            onPrinter={onPrinter}
            onManagePrinters={onManagePrinters}
          />

          <AdvancedPanel
            settings={plan.settings}
            overrides={overrides}
            setOverrides={(next) => {
              setOverrides(next);
              setView('sheet');
            }}
            onResetTips={() => {
              tips.reset();
              setJobDismissed([]);
            }}
            printerName={printer.name}
            defaults={defaults}
          />

          {(error || loadError) && <p className="error">{error || loadError}</p>}

          <div className="actions">
            <button type="button" className="primary" onClick={download} disabled={!plan.perSheet || downloading}>
              {downloading ? 'Building PDF…' : `Download print-ready PDF (${plan.pdfPages} pages)`}
            </button>
            <FileDrop onFiles={onFiles} busy={busy} compact />
          </div>
        </section>
      </div>
    </main>
  );
}
