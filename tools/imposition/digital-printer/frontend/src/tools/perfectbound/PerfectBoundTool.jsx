import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  planPerfectBound, getPerfectBoundWarnings, buildBookInsidePdf, buildCoverPdf, cardStartState, makeSavedDefault, defaultKey,
  orientSheet, getSheet, PERFECT_DEFAULTS, readerSpreads, fmtSize, fmtMm, matchStandard,
} from '@engine';
import { store } from '../../lib/storage.js';
import { downloadBytes } from '../../lib/download.js';
import Segmented from '../../components/Segmented.jsx';
import TutorNote from '../../components/TutorNote.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import SheetCard from '../cards/SheetCard.jsx';
import AdvancedPanel from '../cards/AdvancedPanel.jsx';
import ReaderView from '../booklet/ReaderView.jsx';
import BookletSheetPreview from '../booklet/BookletSheetPreview.jsx';
import BookCard from './BookCard.jsx';
import CoverPreview from './CoverPreview.jsx';

const VIEWS = [
  { value: 'reader', label: 'Book pages' },
  { value: 'sheet', label: 'Inside sheets' },
  { value: 'cover', label: 'Cover' },
];

const KEY_KIND = 'perfectbound';

// Perfect-bound (glued spine) books: signatures for the inside pages and a wrap-around cover.
export default function PerfectBoundTool({
  job, onBack, onFiles, busy, loadError, tips,
  customSheets, onAddCustomSheet, onRemoveCustomSheet,
  printers, printer, onPrinter, onManagePrinters,
}) {
  const { geometry, pdf } = job;
  const savedDefault = (p) => store.get('cardDefaults', {})[defaultKey(p.id, KEY_KIND)] || null;

  // Start on the printer's sheet, or on the sheet that uses least paper when that is much better.
  const startFor = (p) => {
    const saved = savedDefault(p);
    const s = cardStartState(p, saved);
    if (!saved) {
      const trial = planPerfectBound({ geometry, base: s.base, overrides: s.overrides, customSheets, printer: p });
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
  const [book, setBook] = useState(() => ({ ...PERFECT_DEFAULTS, ...store.get('bookStyle', {}) }));
  const [view, setView] = useState('reader');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [side, setSide] = useState(0);
  const [downloading, setDownloading] = useState('');
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
    () => planPerfectBound({ geometry, base: safeBase, overrides, customSheets, printer, book }),
    [geometry, safeBase, overrides, customSheets, printer, book]
  );

  const counts = useMemo(() => {
    const out = {};
    for (const id of printer.sheets) out[id] = plan.layoutFor(orientSheet(getSheet(id, customSheets), safeBase.orientation)).count;
    return out;
  }, [plan, printer.sheets, customSheets, safeBase.orientation]);

  // The book as the reader sees it: cover, inside spreads, back cover.
  const readerItems = useMemo(() => {
    const items = [];
    if (plan.cover.enabled) items.push({ sources: [undefined, plan.cover.front], label: 'Front cover' });
    const spreads = readerSpreads(plan.pages);
    spreads.forEach((sp) => {
      const sources = sp.map((pos) => (pos === null ? (plan.cover.enabled ? null : undefined) : plan.order[pos]));
      const names = sp.filter((pos) => pos !== null).map((pos) => (plan.order[pos] === null ? 'blank' : plan.order[pos] + 1));
      items.push({ sources, label: `${names.length === 1 ? 'Page' : 'Pages'} ${names.join('–')}` });
    });
    if (plan.cover.enabled) items.push({ sources: [plan.cover.back, undefined], label: 'Back cover' });
    return items;
  }, [plan]);

  // Big numbers on the sheets: the page number in the file (cover = page 1).
  const numberFor = useCallback((pos, src) => (src === null ? String(pos + 1 + (plan.cover.enabled ? 1 : 0)) : String(src + 1)), [plan.cover.enabled]);

  const shownSheet = Math.min(sheetIndex, plan.sheetCount - 1);
  const isBack = side === 1;
  const info = plan.sheetsInfo[shownSheet];

  const [renders, setRenders] = useState(new Map());
  useEffect(() => {
    let alive = true;
    const wanted = [...info.front, ...info.back].map((pos) => plan.order[pos]).filter((i) => i !== null);
    Promise.all(wanted.map((i) => pdf.render(i, 700).then((r) => [i, r])))
      .then((list) => alive && setRenders(new Map(list)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pdf, plan, info]);

  const notes = getPerfectBoundWarnings({ plan }).filter((n) => !tips.dismissed.includes(n.id) && !jobDismissed.includes(n.id));
  function dismiss(id) {
    const note = notes.find((n) => n.id === id);
    if (note && note.learn) tips.dismiss(id);
    else setJobDismissed((list) => [...list, id]);
  }

  function update(patch) {
    setBase({ ...safeBase, ...patch });
    setView('sheet');
  }

  function changeBook(patch) {
    const next = { ...book, ...patch };
    setBook(next);
    store.set('bookStyle', { signature: next.signature, paper: next.paper, coverPaper: next.coverPaper, creep: next.creep, grind: next.grind });
    if ('signature' in patch || 'coverFromFile' in patch) setSheetIndex(0);
  }

  const defaults = {
    label: 'Glued books',
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

  async function download(which) {
    setDownloading(which);
    setError('');
    try {
      const sheetTag = (s) => `${s.label}${s.orientation === 'landscape' ? '-L' : ''}`;
      if (which === 'inside') {
        const bytes = await buildBookInsidePdf({ sourceBytes: job.bytes, plan, title: `${job.name} - inside pages` });
        downloadBytes(bytes, `${job.name}_book-inside_${plan.pages}pp_sig${plan.signature}_${sheetTag(plan.sheet)}.pdf`);
      } else {
        const bytes = await buildCoverPdf({ sourceBytes: job.bytes, plan, title: `${job.name} - cover` });
        downloadBytes(bytes, `${job.name}_book-cover_spine${fmtMm(plan.spine)}mm_${sheetTag(plan.cover.sheet)}.pdf`);
      }
    } catch (e) {
      setError(e.message || 'Could not build the PDF.');
    } finally {
      setDownloading('');
    }
  }

  const std = matchStandard(plan.page.w, plan.page.h);
  const sheetName = `${plan.sheet.label}${plan.sheet.orientation === 'landscape' ? ' landscape' : ''}`;

  return (
    <main className="tool-screen">
      <div className="toolbar">
        <button type="button" className="back-btn" onClick={onBack}>‹ Your file</button>
        <span className="toolbar-title">Book (glued spine)</span>
      </div>

      <div className="work">
        <section className="preview-col">
          <div className="summary">
            <div className="summary-main">
              {std ? `${std.name} book` : 'Book'}, {plan.insidePages} inside pages:{' '}
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
              {` · spine ${fmtMm(plan.spine)} mm`}
              {` · ${plan.signatures.length} × ${plan.signature}-page signatures`}
              {` · ${printer.name}`}
            </div>
          </div>

          <Segmented options={VIEWS} value={view} onChange={setView} label="Preview" />

          {view === 'reader' && <ReaderView plan={plan} pdf={pdf} items={readerItems} />}
          {view === 'cover' && <CoverPreview plan={plan} pdf={pdf} />}
          {view === 'sheet' && (
            <>
              <div className="sheet-stepper">
                <button type="button" className="viewer-btn" disabled={shownSheet === 0} onClick={() => setSheetIndex(shownSheet - 1)}>‹</button>
                <span>
                  Sheet {shownSheet + 1} of {plan.sheetCount} · signature {info.signature + 1}
                </span>
                <button type="button" className="viewer-btn" disabled={shownSheet >= plan.sheetCount - 1} onClick={() => setSheetIndex(shownSheet + 1)}>›</button>
              </div>
              <Segmented options={[{ value: 0, label: 'Front' }, { value: 1, label: 'Back' }]} value={side} onChange={setSide} label="Side" />
              <BookletSheetPreview plan={plan} sheetIndex={shownSheet} isBack={isBack} renders={renders} numberFor={numberFor} label="Book inside sheet" />
              <div className="legend">
                <span><i className="lg lg-cut" /> fold and trim lines</span>
                <span>Big numbers = page numbers in your file</span>
              </div>
            </>
          )}
        </section>

        <section className="controls-col">
          <BookCard plan={plan} book={book} onChange={changeBook} />

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
            <button type="button" className="primary" onClick={() => download('inside')} disabled={!plan.perSheet || !!downloading}>
              {downloading === 'inside' ? 'Building PDF…' : `Download inside pages (${plan.pdfPages} pages)`}
            </button>
            {plan.cover.enabled && (
              <button type="button" className="ghost-btn wide-btn" onClick={() => download('cover')} disabled={!plan.cover.layout || !!downloading}>
                {downloading === 'cover' ? 'Building PDF…' : 'Download cover PDF'}
              </button>
            )}
            <FileDrop onFiles={onFiles} busy={busy} compact />
          </div>
        </section>
      </div>
    </main>
  );
}
