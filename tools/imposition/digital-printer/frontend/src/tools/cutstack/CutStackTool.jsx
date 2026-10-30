import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  planCutStack, defaultMode, getCutStackWarnings, buildCutStackPdf, countsBySheet, detectProduct,
  cardStartState, makeSavedDefault, defaultKey, computeArtFit, itemAt, canvasAngle, NUMBERING_DEFAULTS,
  fmtSize, fmtMm, COPY_NAME_SIZE, PART_NAMES,
} from '@engine';
import { useRenders } from '../../hooks/useRenders.js';
import { store } from '../../lib/storage.js';
import { downloadBytes } from '../../lib/download.js';
import Segmented from '../../components/Segmented.jsx';
import TutorNote from '../../components/TutorNote.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import PrintSizeCard from '../cards/PrintSizeCard.jsx';
import BleedCard from '../cards/BleedCard.jsx';
import SheetCard from '../cards/SheetCard.jsx';
import AdvancedPanel from '../cards/AdvancedPanel.jsx';
import SheetPreview from '../cards/SheetPreview.jsx';
import FinishedPreview from '../cards/FinishedPreview.jsx';
import { useSafeZone } from '../cards/useSafeZone.js';
import { previewBleedCanvases, printBleedArt } from '../cards/bleedArt.js';
import NumberingCard from './NumberingCard.jsx';
import BooksCard from './BooksCard.jsx';
import NumberPlacer from './NumberPlacer.jsx';
import StackGuide from './StackGuide.jsx';
import { drawNumber } from './numberText.js';

const MODES = [
  { value: 'number', label: 'Number my design' },
  { value: 'pages', label: 'Pages in order' },
];

// Number style the user picked last time (not the start number or count).
const STYLE_KEYS = ['prefix', 'suffix', 'digits', 'color', 'font', 'size', 'parts', 'perBook', 'printOrder', 'copyNames', 'copyNameList'];
const loadStyle = () => {
  const saved = store.get('numberingStyle', {});
  const style = {};
  for (const k of STYLE_KEYS) if (saved[k] !== undefined) style[k] = saved[k];
  return style;
};

const defaultsKeyFor = (printerId, kind) => defaultKey(printerId, `cutstack:${kind}`);

// Numbered receipt books, tickets and invoices, and many-page files kept in order (cut & stack).
export default function CutStackTool({
  job, onBack, onFiles, busy, loadError, tips,
  customSheets, onAddCustomSheet, onRemoveCustomSheet,
  printers, printer, onPrinter, onManagePrinters,
}) {
  const { geometry, pdf, imageInfo } = job;
  const original = detectProduct(geometry.pages[0].trimMm, geometry.pageCount);
  const savedDefault = () => store.get('cardDefaults', {})[defaultsKeyFor(printer.id, original.kind)] || null;

  const [start] = useState(() => cardStartState(printer, savedDefault()));
  const [base, setBase] = useState(start.base);
  const [overrides, setOverrides] = useState(start.overrides);
  const [mode, setMode] = useState(() => defaultMode(geometry));
  const [numbering, setNumbering] = useState(() => ({ ...NUMBERING_DEFAULTS, ...loadStyle() }));
  const [view, setView] = useState(() => (defaultMode(geometry) === 'number' ? 'place' : 'sheet'));
  const [side, setSide] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [showStacks, setShowStacks] = useState(true);
  const [previewPart, setPreviewPart] = useState(0); // which copy (white / pink / yellow) the sheet preview shows
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [jobDismissed, setJobDismissed] = useState([]);
  const [hasDefault, setHasDefault] = useState(() => !!savedDefault());
  const continueFrom = store.get('numberingNext', null);

  // Another printer: start again from its sheet and saved default (keep size).
  const lastPrinter = useRef(printer.id);
  useEffect(() => {
    if (lastPrinter.current === printer.id) return;
    lastPrinter.current = printer.id;
    const saved = store.get('cardDefaults', {})[defaultsKeyFor(printer.id, original.kind)] || null;
    const s = cardStartState(printer, saved);
    setBase((b) => ({ ...s.base, size: b.size, fitMode: b.fitMode }));
    setOverrides(s.overrides);
    setHasDefault(!!saved);
    setView('sheet');
  }, [printer, original.kind]);

  const safeBase = printer.sheets.includes(base.sheet) ? base : { ...base, sheet: printer.defaultSheet };

  const sideIndexes = mode === 'pages' ? [0] : geometry.pages.slice(0, 2).map((p) => p.index);
  const renders = useRenders(pdf, sideIndexes, 1000);

  const args = { geometry, base: safeBase, overrides, customSheets, printer, numbering, mode };
  const checkPlan = useMemo(() => planCutStack(args), [geometry, safeBase, overrides, customSheets, printer, numbering, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const safety = useSafeZone(pdf, checkPlan, renders);
  const inkTouches = !!safety && safety.some((s) => s && s.ink && s.ink.touches);
  const plan = useMemo(() => planCutStack({ ...args, inkTouches }), [checkPlan, inkTouches]); // eslint-disable-line react-hooks/exhaustive-deps
  const bleedPreview = useMemo(() => previewBleedCanvases(plan, renders), [plan, renders]);
  const counts = useMemo(
    () => countsBySheet(plan, printer.sheets, customSheets, safeBase.orientation),
    [plan, printer.sheets, customSheets, safeBase.orientation]
  );

  const { layout, sheet, settings, sheets, total, perSheet } = plan;
  const sheetName = `${sheet.label}${sheet.orientation === 'landscape' ? ' landscape' : ''}`;
  const shownSheet = Math.min(sheetIndex, Math.max(0, sheets - 1));

  // Pages mode: draw the real page in every spot of the sheet being shown.
  const itemsOnSheet = useMemo(() => {
    if (mode !== 'pages' || !perSheet) return [];
    const list = [];
    for (let j = 0; j < perSheet; j++) {
      const item = itemAt(shownSheet, j, sheets, total);
      if (item !== null) list.push(item);
    }
    return list;
  }, [mode, perSheet, shownSheet, sheets, total]);
  const pageRenders = useRenders(pdf, itemsOnSheet, 500);

  const pieceAt = useCallback(
    (j) => {
      const item = itemAt(shownSheet, j, sheets, total);
      if (item === null) return null; // empty spot
      if (mode !== 'pages') return undefined; // the one design
      const page = geometry.pages[item];
      const fit = computeArtFit({ srcW: page.trimMm.w, srcH: page.trimMm.h, srcBleed: page.bleedMm, outW: plan.out.w, outH: plan.out.h, mode: plan.mode });
      return { page, fit, render: pageRenders[itemsOnSheet.indexOf(item)] };
    },
    [shownSheet, sheets, total, mode, geometry, plan, pageRenders, itemsOnSheet]
  );

  const decorate = useCallback(
    (ctx, { slot, index, p, k, isBack }) => {
      const item = itemAt(shownSheet, index, sheets, total);
      if (item === null) return;
      if (mode === 'number' && !isBack) {
        ctx.translate(p.cx * k, p.cy * k);
        ctx.rotate(canvasAngle(p.rot));
        const text = plan.numbering.format(item);
        for (const pos of plan.numbering.positions) {
          drawNumber(ctx, text, (pos.x - plan.out.w / 2) * k, (pos.y - plan.out.h / 2) * k, k, plan.numbering);
        }
        if (plan.numbering.copyNames) {
          const at = plan.numbering.copyNameAt;
          const name = plan.numbering.copyNameList[Math.min(previewPart, plan.parts - 1)];
          drawNumber(ctx, name, (at.x - plan.out.w / 2) * k, (at.y - plan.out.h / 2) * k, k, { ...plan.numbering, size: COPY_NAME_SIZE, font: 'bold' });
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (showStacks) {
        const r = Math.max(9, Math.min(slot.w, slot.h) * k * 0.16);
        ctx.fillStyle = 'rgba(15, 18, 22, 0.78)';
        ctx.beginPath();
        ctx.arc(p.cx * k, p.cy * k, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.round(r * 1.05)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), p.cx * k, p.cy * k + 1);
      }
    },
    [shownSheet, sheets, total, mode, plan, showStacks, previewPart]
  );

  const notes = getCutStackWarnings({ plan, imageInfo, safety }).filter(
    (n) => !tips.dismissed.includes(n.id) && !jobDismissed.includes(n.id)
  );

  function dismiss(id) {
    const note = notes.find((n) => n.id === id);
    if (note && note.learn) tips.dismiss(id);
    else setJobDismissed((list) => [...list, id]);
  }

  function update(patch) {
    setBase({ ...safeBase, ...patch });
    if ('size' in patch || 'fitMode' in patch) setView(mode === 'number' ? 'place' : 'sheet');
    if ('sheet' in patch || 'orientation' in patch || 'marks' in patch || 'makeBleed' in patch) setView('sheet');
  }

  function changeNumbering(patch) {
    const next = { ...numbering, ...patch };
    setNumbering(next);
    const style = {};
    for (const k of STYLE_KEYS) style[k] = next[k];
    store.set('numberingStyle', style);
    if ('positions' in patch || 'size' in patch || 'font' in patch || 'prefix' in patch || 'suffix' in patch) setView('place');
    if ('count' in patch || 'parts' in patch) setSheetIndex(0);
  }

  function changeOverrides(next) {
    setOverrides(next);
    setView('sheet');
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
      all[defaultsKeyFor(printer.id, original.kind)] = makeSavedDefault(safeBase, overrides);
      store.set('cardDefaults', all);
      setHasDefault(true);
    },
    forget() {
      const all = store.get('cardDefaults', {});
      delete all[defaultsKeyFor(printer.id, original.kind)];
      store.set('cardDefaults', all);
      setHasDefault(false);
    },
  };

  async function download() {
    setDownloading(true);
    setError('');
    try {
      const bleedArt = mode === 'number' ? await printBleedArt(pdf, plan) : null;
      const bytes = await buildCutStackPdf({
        sourceBytes: job.bytes,
        plan,
        bleedArt,
        title: `${job.name} - cut and stack ${perSheet}-up ${sheetName}`,
      });
      const range = mode === 'number' ? `${numbering.start}-${numbering.start + total - 1}` : `${total}pages`;
      downloadBytes(bytes, `${job.name}_${range}_${perSheet}up_${sheet.label}${sheet.orientation === 'landscape' ? '-L' : ''}.pdf`);
      if (mode === 'number') store.set('numberingNext', numbering.start + total);
    } catch (e) {
      setError(e.message || 'Could not build the PDF.');
    } finally {
      setDownloading(false);
    }
  }

  const views =
    mode === 'number'
      ? [
          { value: 'place', label: 'Number & place' },
          { value: 'sheet', label: 'Print sheet' },
        ]
      : [
          { value: 'finished', label: 'Finished piece' },
          { value: 'sheet', label: 'Print sheet' },
        ];
  const activeView = views.some((v) => v.value === view) ? view : 'sheet';

  return (
    <main className="tool-screen">
      <div className="toolbar">
        <button type="button" className="back-btn" onClick={onBack}>‹ Your file</button>
        <span className="toolbar-title">Numbered books & tickets</span>
      </div>

      <div className="work">
        <section className="preview-col">
          <div className="summary">
            <div className="summary-main">
              {perSheet > 0 ? (
                <>
                  {mode === 'number' ? `${plan.numbering.first} to ${plan.numbering.last}` : `${total} pages in order`}:{' '}
                  <strong>{perSheet} per {sheetName} sheet</strong>
                </>
              ) : (
                <>Doesn’t fit on {sheetName}</>
              )}
            </div>
            <div className="summary-sub">
              {fmtSize(plan.out.w, plan.out.h)}
              {settings.bleedUsed > 0 ? ` · ${fmtMm(settings.bleedUsed)} mm bleed` : ' · no bleed'}
              {` · ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}`}
              {plan.parts > 1 ? ` × ${plan.parts} copies` : ''}
              {` · ${plan.pages} PDF ${plan.pages === 1 ? 'page' : 'pages'} · ${printer.name}`}
            </div>
          </div>

          <Segmented options={views} value={activeView} onChange={setView} label="Preview" />

          {activeView === 'place' && <NumberPlacer plan={plan} render={renders[0]} onPositions={(positions) => changeNumbering({ positions })} />}
          {activeView === 'finished' && <FinishedPreview plan={plan} renders={renders} copies={total} unit="pieces" safety={safety} />}
          {activeView === 'sheet' && (
            <>
              {plan.twoSided && (
                <Segmented options={[{ value: 0, label: 'Front' }, { value: 1, label: 'Back' }]} value={side} onChange={setSide} label="Side" />
              )}
              {plan.parts > 1 && mode === 'number' && (
                <Segmented
                  options={PART_NAMES.slice(0, plan.parts).map((name, i) => ({ value: i, label: `Copy ${i + 1} (${name})` }))}
                  value={Math.min(previewPart, plan.parts - 1)}
                  onChange={setPreviewPart}
                  label="Copy"
                />
              )}
              {sheets > 1 && (
                <div className="sheet-stepper">
                  <button type="button" className="viewer-btn" disabled={shownSheet === 0} onClick={() => setSheetIndex(shownSheet - 1)}>‹</button>
                  <span>Sheet {shownSheet + 1} of {sheets}</span>
                  <button type="button" className="viewer-btn" disabled={shownSheet >= sheets - 1} onClick={() => setSheetIndex(shownSheet + 1)}>›</button>
                  <button type="button" className="viewer-btn" disabled={shownSheet >= sheets - 1} onClick={() => setSheetIndex(sheets - 1)}>Last</button>
                </div>
              )}
              <SheetPreview plan={plan} renders={renders} side={side} bleedArt={bleedPreview} pieceAt={pieceAt} decorate={decorate} />
              <label className="switch-row">
                <span className="hint">Show stack numbers (which pile each spot goes to)</span>
                <input type="checkbox" className="switch" checked={showStacks} onChange={(e) => setShowStacks(e.target.checked)} />
              </label>
              <StackGuide plan={plan} />
            </>
          )}
        </section>

        <section className="controls-col">
          {geometry.pageCount >= 2 && (
            <div className="card">
              <div className="field-label">What is in your file?</div>
              <Segmented
                options={MODES}
                value={mode}
                onChange={(v) => {
                  setMode(v);
                  setSheetIndex(0);
                  setView(v === 'number' ? 'place' : 'sheet');
                }}
                label="Mode"
              />
              <p className="hint">
                {mode === 'number'
                  ? `One design${plan.twoSided ? ' (page 1 front, page 2 back)' : ''} gets a different number on every piece.`
                  : `Each of the ${geometry.pageCount} pages is a different piece. They stay in page order after cutting.`}
              </p>
            </div>
          )}

          {mode === 'number' && <NumberingCard plan={plan} numbering={numbering} onChange={changeNumbering} continueFrom={continueFrom} />}
          {mode === 'number' && <BooksCard plan={plan} numbering={numbering} onChange={changeNumbering} />}

          {notes.length > 0 && (
            <div className="notes">
              {notes.map((n) => (
                <TutorNote key={n.id} note={n} onDismiss={dismiss} />
              ))}
            </div>
          )}

          <PrintSizeCard plan={plan} base={safeBase} onChange={update} imageInfo={imageInfo} />
          {mode === 'number' && <BleedCard plan={plan} base={safeBase} onChange={update} checking={!safety} />}

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
            <button type="button" className="primary" onClick={download} disabled={!perSheet || downloading}>
              {downloading ? `Building PDF (${plan.pages} pages)…` : `Download print-ready PDF (${plan.pages} pages)`}
            </button>
            <FileDrop onFiles={onFiles} busy={busy} compact />
          </div>
        </section>
      </div>
    </main>
  );
}
