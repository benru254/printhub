import { useEffect, useMemo, useRef, useState } from 'react';
import {
  planCards, countsBySheet, getCardWarnings, buildCardsPdf, detectProduct,
  cardStartState, makeSavedDefault, defaultKey, fmtSize, fmtMm,
} from '@engine';
import { useRenders } from '../../hooks/useRenders.js';
import { store } from '../../lib/storage.js';
import { downloadBytes } from '../../lib/download.js';
import Segmented from '../../components/Segmented.jsx';
import TutorNote from '../../components/TutorNote.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import PrintSizeCard from './PrintSizeCard.jsx';
import SheetCard from './SheetCard.jsx';
import AdvancedPanel from './AdvancedPanel.jsx';
import SheetPreview from './SheetPreview.jsx';
import FinishedPreview from './FinishedPreview.jsx';
import BleedCard from './BleedCard.jsx';
import ShapeCard from './ShapeCard.jsx';
import { useSafeZone } from './useSafeZone.js';
import { previewBleedCanvases, printBleedArt } from './bleedArt.js';

const VIEWS = [
  { value: 'finished', label: 'Finished pieces' },
  { value: 'sheet', label: 'Print sheet' },
];

const savedDefaultFor = (printerId, kind) => store.get('cardDefaults', {})[defaultKey(printerId, kind)] || null;

// Cards, labels & stickers: the same design repeated across a sheet.
export default function CardsTool({
  job, onBack, onFiles, busy, loadError, tips,
  customSheets, onAddCustomSheet, onRemoveCustomSheet,
  printers, printer, onPrinter, onManagePrinters,
}) {
  const { geometry, pdf, imageInfo } = job;
  // The kind of product in the file (used for "my default", e.g. business cards).
  const original = detectProduct(geometry.pages[0].trimMm, geometry.pageCount);

  const [start] = useState(() => cardStartState(printer, savedDefaultFor(printer.id, original.kind)));
  const [base, setBase] = useState(start.base);
  const [overrides, setOverrides] = useState(start.overrides);
  const [view, setView] = useState('finished');
  const [side, setSide] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [jobDismissed, setJobDismissed] = useState([]);
  const [hasDefault, setHasDefault] = useState(() => !!savedDefaultFor(printer.id, original.kind));

  // Another printer chosen: start again from its sheet and saved default (keep size and copies).
  const lastPrinter = useRef(printer.id);
  useEffect(() => {
    if (lastPrinter.current === printer.id) return;
    lastPrinter.current = printer.id;
    const saved = savedDefaultFor(printer.id, original.kind);
    const s = cardStartState(printer, saved);
    setBase((b) => ({ ...s.base, size: b.size, fitMode: b.fitMode, copies: saved ? s.base.copies : b.copies }));
    setOverrides(s.overrides);
    setHasDefault(!!saved);
    setView('sheet');
  }, [printer, original.kind]);

  // If the printer's sheets were edited, never use a sheet it can't take.
  const safeBase = printer.sheets.includes(base.sheet) ? base : { ...base, sheet: printer.defaultSheet };

  const sideIndexes = geometry.pages.slice(0, 2).map((p) => p.index);
  const renders = useRenders(pdf, sideIndexes, 1000);

  // 1) Check the edges of the finished design (safe zone + does colour touch the edge).
  //    This only depends on size and fit, so it is checked on a plan without made bleed.
  const checkPlan = useMemo(
    () => planCards({ geometry, base: safeBase, overrides, customSheets, printer }),
    [geometry, safeBase, overrides, customSheets, printer]
  );
  const safety = useSafeZone(pdf, checkPlan, renders);
  const inkTouches = !!safety && safety.some((s) => s && s.ink && s.ink.touches);

  // 2) The real plan, which may make bleed when colour touches the edge.
  const plan = useMemo(
    () => planCards({ geometry, base: safeBase, overrides, customSheets, printer, inkTouches }),
    [geometry, safeBase, overrides, customSheets, printer, inkTouches]
  );
  const bleedPreview = useMemo(() => previewBleedCanvases(plan, renders), [plan, renders]);
  const counts = useMemo(
    () => countsBySheet(plan, printer.sheets, customSheets, safeBase.orientation),
    [plan, printer.sheets, customSheets, safeBase.orientation]
  );

  const product = detectProduct(plan.out, geometry.pageCount);
  const { layout, sheet, settings, twoSided } = plan;
  const sheetName = `${sheet.label}${sheet.orientation === 'landscape' ? ' landscape' : ''}`;
  const notes = getCardWarnings({ plan, geometry, imageInfo, safety }).filter(
    (n) => !tips.dismissed.includes(n.id) && !jobDismissed.includes(n.id)
  );

  // General tips hide for good; notes about this file only hide for this job.
  function dismiss(id) {
    const note = notes.find((n) => n.id === id);
    if (note && note.learn) tips.dismiss(id);
    else setJobDismissed((list) => [...list, id]);
  }

  // Change settings. Size changes show the finished pieces; sheet changes show the sheet.
  function update(patch) {
    setBase({ ...safeBase, ...patch });
    if ('size' in patch || 'fitMode' in patch || 'shape' in patch || 'radius' in patch) setView('finished');
    if ('cutter' in patch) setView('sheet');
    if ('sheet' in patch || 'orientation' in patch || 'marks' in patch || 'makeBleed' in patch) setView('sheet');
  }

  function changeOverrides(next) {
    setOverrides(next);
    setView(next.safe !== overrides.safe ? 'finished' : 'sheet');
  }

  function addCustom(sheetDef) {
    onAddCustomSheet(sheetDef);
    update({ sheet: sheetDef.id });
  }

  function removeCustom(id) {
    onRemoveCustomSheet(id);
    if (safeBase.sheet === id) update({ sheet: printer.defaultSheet });
  }

  const defaults = {
    label: original.label,
    exists: hasDefault,
    save() {
      const all = store.get('cardDefaults', {});
      all[defaultKey(printer.id, original.kind)] = makeSavedDefault(safeBase, overrides);
      store.set('cardDefaults', all);
      setHasDefault(true);
    },
    forget() {
      const all = store.get('cardDefaults', {});
      delete all[defaultKey(printer.id, original.kind)];
      store.set('cardDefaults', all);
      setHasDefault(false);
    },
  };

  async function download() {
    setDownloading(true);
    setError('');
    try {
      const bleedArt = await printBleedArt(pdf, plan); // null when no bleed is made
      const bytes = await buildCardsPdf({
        sourceBytes: job.bytes,
        plan,
        bleedArt,
        title: `${job.name} - ${layout.count}-up ${sheetName}`,
      });
      downloadBytes(
        bytes,
        `${job.name}_${fmtMm(plan.out.w)}x${fmtMm(plan.out.h)}_${layout.count}up_${sheet.label}${sheet.orientation === 'landscape' ? '-L' : ''}.pdf`
      );
    } catch (e) {
      setError(e.message || 'Could not build the PDF.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="tool-screen">
      <div className="toolbar">
        <button type="button" className="back-btn" onClick={onBack}>‹ Your file</button>
        <span className="toolbar-title">Cards, labels & stickers</span>
      </div>

      <div className="work">
        <section className="preview-col">
          <div className="summary">
            <div className="summary-main">
              {layout.count > 0 ? (
                <>
                  {product.label}: <strong>{layout.count} per {sheetName} sheet</strong>
                  {twoSided ? ', front and back' : ''}
                </>
              ) : (
                <>Doesn’t fit on {sheetName}</>
              )}
            </div>
            <div className="summary-sub">
              {fmtSize(plan.out.w, plan.out.h)}
              {settings.bleedUsed > 0 ? ` · ${fmtMm(settings.bleedUsed)} mm bleed` : ' · no bleed'}
              {plan.resized ? ' · resized' : ''}
              {layout.rotated ? ' · turned to fit more' : ''}
              {` · ${printer.name}`}
            </div>
          </div>

          <Segmented options={VIEWS} value={view} onChange={setView} label="Preview" />

          {view === 'finished' ? (
            <FinishedPreview plan={plan} renders={renders} copies={settings.copies} unit={product.unit} safety={safety} />
          ) : (
            <>
              {twoSided && (
                <Segmented
                  options={[
                    { value: 0, label: 'Front' },
                    { value: 1, label: 'Back' },
                  ]}
                  value={side}
                  onChange={setSide}
                  label="Side"
                />
              )}
              <SheetPreview plan={plan} renders={renders} side={side} bleedArt={bleedPreview} />
              <div className="legend">
                <span><i className="lg lg-cut" /> cut line</span>
                <span><i className="lg lg-margin" /> printer can’t print outside</span>
              </div>
            </>
          )}
        </section>

        <section className="controls-col">
          <PrintSizeCard plan={plan} base={safeBase} onChange={update} imageInfo={imageInfo} />

          <BleedCard plan={plan} base={safeBase} onChange={update} checking={!safety} />

          <ShapeCard plan={plan} base={safeBase} onChange={update} fileName={job.name} />

          <div className="card copies">
            <label className="field-label" htmlFor="copies">How many {product.unit}?</label>
            <input
              id="copies"
              type="number"
              inputMode="numeric"
              min="1"
              className="num num-big"
              value={safeBase.copies}
              onChange={(e) => update({ copies: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
            />
            {layout.count > 0 && (
              <div className="copies-result">
                = <strong>{plan.sheetsNeeded} {sheet.label} {plan.sheetsNeeded === 1 ? 'sheet' : 'sheets'}</strong>
                {twoSided ? ' (double-sided)' : ''}
                <span className="hint"> · {layout.count * plan.sheetsNeeded} {product.unit} printed · {layout.wastePct}% of paper unused</span>
              </div>
            )}
          </div>

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
            onAddCustom={addCustom}
            onRemoveCustom={removeCustom}
            printers={printers}
            printer={printer}
            onPrinter={onPrinter}
            onManagePrinters={onManagePrinters}
          />

          <AdvancedPanel
            settings={settings}
            overrides={overrides}
            setOverrides={changeOverrides}
            onResetTips={() => {
              tips.reset();
              setJobDismissed([]);
            }}
            printerName={printer.name}
            defaults={defaults}
          />

          {(error || loadError) && <p className="error">{error || loadError}</p>}

          <div className="actions">
            <button type="button" className="primary" onClick={download} disabled={!layout.count || downloading}>
              {downloading ? 'Building PDF…' : 'Download print-ready PDF'}
            </button>
            <FileDrop onFiles={onFiles} busy={busy} compact />
          </div>
        </section>
      </div>
    </main>
  );
}
