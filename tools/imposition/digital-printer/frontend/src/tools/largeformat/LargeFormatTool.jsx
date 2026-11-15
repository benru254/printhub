import { useMemo, useState } from 'react';
import { planLargeFormat, buildLargeFormatPdf, getLargeFormatWarnings, LF_DEFAULTS, finishToSettings, fullPriceList, sizeText, getSheet, orientSheet, fmtMm } from '@engine';
import Segmented from '../../components/Segmented.jsx';
import TutorNote from '../../components/TutorNote.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import OrderOutputs from '../../components/OrderOutputs.jsx';
import { useRenders } from '../../hooks/useRenders.js';
import { downloadBytes } from '../../lib/download.js';
import LargePreview from './LargePreview.jsx';

const MM = { m: 1000, cm: 10, mm: 1, ft: 304.8 };
const FIT = [
  { value: 'fill', label: 'Fill' },
  { value: 'fit', label: 'Fit (show all)' },
  { value: 'stretch', label: 'Stretch' },
];
const show = (mm, unit) => String(Math.round((mm / MM[unit]) * 1000) / 1000);
const metres = (mm) => `${Math.round(mm / 10) / 100} m`;

function Mm({ label, hint, value, onChange, min = 0, max = 500 }) {
  return (
    <label className="price-field">
      <span>{label}{hint && <small> · {hint}</small>}</span>
      <span><input className="num" type="number" inputMode="decimal" min={min} max={max} step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} /> <span className="unit">mm</span></span>
    </label>
  );
}

// LARGE FORMAT (the shop's tool): any design at any size for the roll printer, with hems,
// eyelets and pole pockets; split into parts when wider than the roll; or tiled on cut sheets.
export default function LargeFormatTool({ job, initial, ctx, onBack, onFiles, busy, loadError, tips, printer, customSheets }) {
  const materials = useMemo(() => fullPriceList(ctx.shop.priceList).largeFormat.materials, [ctx.shop.priceList]);
  const [base, setBase] = useState(() => {
    const b = (initial && initial.base) || {};
    const m = materials.find((x) => x.id === b.material) || materials[0];
    const page = job.geometry.pages[0];
    // No order: start at 1 m wide, in the design's own shape.
    const w = b.w || 1000;
    const h = b.h || Math.max(100, Math.round((1000 * page.trimMm.h) / page.trimMm.w / 10) * 10);
    return { ...LF_DEFAULTS, w, h, copies: b.copies || 1, material: m.id, rollWidth: m.rollWidth, ...finishToSettings(b.finish) };
  });
  const [unit, setUnit] = useState(() => (Math.max(base.w, base.h) >= 1000 ? 'm' : 'cm'));
  const [size, setSize] = useState(() => ({ w: show(base.w, unit), h: show(base.h, unit) }));
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const update = (patch) => setBase((b) => ({ ...b, ...patch }));

  const sheet = orientSheet(getSheet(printer.defaultSheet, customSheets), 'portrait');
  const used = base.media === 'sheet'
    ? { ...base, sheetW: sheet.w, sheetH: sheet.h, edge: Math.max(printer.margins.top, printer.margins.right, printer.margins.bottom, printer.margins.left) }
    : base;
  const plan = useMemo(() => planLargeFormat({ geometry: job.geometry, imageInfo: job.imageInfo, base: used }), [job, JSON.stringify(used)]); // eslint-disable-line react-hooks/exhaustive-deps
  const renders = useRenders(job.pdf, [0], 1600);
  const notes = getLargeFormatWarnings({ plan }).filter((n) => !tips.dismissed.includes(n.id));
  const order = ctx.order;
  const title = order ? `${order.code} ${order.title}` : job.name;

  function typeSize(patch, nextUnit = unit) {
    const next = { ...size, ...patch };
    setSize(next);
    const w = Number(next.w) * MM[nextUnit];
    const h = Number(next.h) * MM[nextUnit];
    if (w >= 50 && h >= 50) update({ w: Math.round(w), h: Math.round(h) });
  }

  async function buildOutput() {
    const bytes = await buildLargeFormatPdf({ sourceBytes: job.bytes, plan, title });
    const scale = plan.scale === 1 ? '' : '-PRINT-AT-1000pct';
    return { bytes, name: `${job.name}-${Math.round(plan.finished.w)}x${Math.round(plan.finished.h)}mm${scale}.pdf` };
  }

  async function download() {
    setBuilding(true);
    setError('');
    try {
      const { bytes, name } = await buildOutput();
      downloadBytes(bytes, name);
    } catch (e) {
      setError(e.message || 'The file could not be made.');
    } finally {
      setBuilding(false);
    }
  }

  const parts = plan.panels.length;
  const partSize = sizeText(Math.round(plan.panel.w), Math.round(plan.panel.h));

  return (
    <main className="tool-screen">
      <div className="toolbar">
        <button type="button" className="back-btn" onClick={onBack}>‹ Your file</button>
        <span className="toolbar-title">Banners, posters & large prints</span>
      </div>

      <div className="work">
        <section className="preview-col">
          <div className="summary">
            <div className="summary-main">
              {plan.fits ? (
                <>
                  {sizeText(plan.finished.w, plan.finished.h)}: <strong>{parts === 1 ? 'one piece' : `${parts} parts of ${partSize}`}</strong>
                </>
              ) : (
                <>Doesn’t fit</>
              )}
            </div>
            <div className="summary-sub">
              {plan.media === 'roll'
                ? `${metres(plan.mediaLength)} of the ${metres(base.rollWidth)} roll${plan.copies > 1 ? ` for ${plan.copies} copies` : ''}${plan.across === 'h' ? ' · turned on the roll' : ''}`
                : `${parts * plan.copies} ${sheet.label} ${parts * plan.copies === 1 ? 'sheet' : 'sheets'}`}
              {plan.hem ? ` · ${fmtMm(plan.hem)} mm hem` : ''}
              {plan.eyelets.length ? ` · ${plan.eyelets.length} eyelets` : ''}
              {plan.quality && <span className={`quality quality-${plan.quality.level}`}>{plan.dpi} dpi · {plan.quality.label}</span>}
            </div>
          </div>
          <LargePreview plan={plan} render={renders[0]} />
          <div className="legend">
            <span><i className="lg lg-cut" /> finished size</span>
            {parts > 1 && <span><i className="lg lg-join" /> join</span>}
            {plan.eyelets.length > 0 && <span><i className="lg lg-eyelet" /> eyelet</span>}
          </div>
        </section>

        <section className="controls-col">
          <div className="card">
            <div className="field-label">Finished size</div>
            <div className="own-size">
              <label><span className="hint">Width</span><input className="num" type="number" inputMode="decimal" min="0" step="any" aria-label="Width" value={size.w} onChange={(e) => typeSize({ w: e.target.value })} /></label>
              <span className="own-x" aria-hidden>×</span>
              <label><span className="hint">Height</span><input className="num" type="number" inputMode="decimal" min="0" step="any" aria-label="Height" value={size.h} onChange={(e) => typeSize({ h: e.target.value })} /></label>
              <label>
                <span className="hint">in</span>
                <select className="select" aria-label="Unit" value={unit} onChange={(e) => { setUnit(e.target.value); setSize({ w: show(base.w, e.target.value), h: show(base.h, e.target.value) }); }}>
                  <option value="m">metres</option>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                  <option value="ft">feet</option>
                </select>
              </label>
            </div>
            <div className="field-label spaced">How the design fills it</div>
            <Segmented options={FIT} value={base.fitMode} onChange={(fitMode) => update({ fitMode })} label="Fit" />
            <label className="field-label spaced" htmlFor="lf-copies">Copies</label>
            <input id="lf-copies" className="num" type="number" inputMode="numeric" min="1" value={base.copies} onChange={(e) => update({ copies: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
          </div>

          <div className="card">
            <div className="field-label">Printed on</div>
            <Segmented options={[{ value: 'roll', label: 'Roll' }, { value: 'sheet', label: `Cut sheets (${sheet.label})` }]} value={base.media} onChange={(media) => update({ media })} label="Printed on" />
            {base.media === 'roll' ? (
              <>
                <label className="field-label spaced" htmlFor="lf-material">Material</label>
                <select id="lf-material" className="select wide-select" value={base.material} onChange={(e) => { const m = materials.find((x) => x.id === e.target.value); update({ material: m.id, rollWidth: m.rollWidth }); }}>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name} · {metres(m.rollWidth)} roll</option>)}
                </select>
                <Mm label="Roll width" value={base.rollWidth} min={100} max={6000} onChange={(rollWidth) => update({ rollWidth })} />
              </>
            ) : (
              <p className="hint">Tiles for {printer.name}: each sheet overlaps the next by {fmtMm(base.overlap)} mm. Change the sheet under the printer button.</p>
            )}
          </div>

          <div className="card">
            <div className="field-label">Finishing</div>
            <label className="switch-row"><span>Hem (folded, welded edge)</span><input type="checkbox" className="switch" checked={base.hem > 0} onChange={(e) => update({ hem: e.target.checked ? 25 : 0 })} /></label>
            {base.hem > 0 && <Mm label="Hem width" value={base.hem} max={200} onChange={(hem) => update({ hem })} />}
            <label className="switch-row"><span>Eyelets</span><input type="checkbox" className="switch" checked={base.eyelets} onChange={(e) => update({ eyelets: e.target.checked })} /></label>
            {base.eyelets && <Mm label="About every" value={base.eyeletSpacing} min={100} max={2000} onChange={(eyeletSpacing) => update({ eyeletSpacing })} />}
            <label className="switch-row"><span>Pole pockets (top and bottom)</span><input type="checkbox" className="switch" checked={base.pocketTop > 0} onChange={(e) => update({ pocketTop: e.target.checked ? 75 : 0, pocketBottom: e.target.checked ? 75 : 0 })} /></label>
            {base.pocketTop > 0 && <Mm label="Pocket (flat)" value={base.pocketTop} onChange={(v) => update({ pocketTop: v, pocketBottom: v })} />}
          </div>

          <details className="card">
            <summary className="field-label">More settings</summary>
            <Mm label="Parts overlap" hint="for joining" value={base.overlap} max={200} onChange={(overlap) => update({ overlap })} />
            {base.media === 'roll' && <Mm label="Unprinted edge of the roll" value={base.edge} max={100} onChange={(edge) => update({ edge })} />}
            {!base.hem && <Mm label="Trim (bleed) around" value={base.bleed} max={50} onChange={(bleed) => update({ bleed })} />}
            <label className="switch-row"><span>Cut marks, join lines and a label</span><input type="checkbox" className="switch" checked={base.marks} onChange={(e) => update({ marks: e.target.checked })} /></label>
            {base.media === 'roll' && <label className="switch-row"><span>Turn on the roll when that saves material</span><input type="checkbox" className="switch" checked={base.allowRotate} onChange={(e) => update({ allowRotate: e.target.checked })} /></label>}
            <label className="switch-row"><span>Mirror the design’s edges into the hem</span><input type="checkbox" className="switch" checked={base.edgeFill !== 'white'} onChange={(e) => update({ edgeFill: e.target.checked ? 'auto' : 'white' })} /></label>
          </details>

          {notes.length > 0 && (
            <div className="notes">
              {notes.map((n) => <TutorNote key={n.id} note={n} onDismiss={tips.dismiss} />)}
            </div>
          )}

          {order && <OrderOutputs order={order} job={job} outputs={[{ kind: 'imposed', label: 'print-ready PDF', build: buildOutput }]} disabled={!plan.fits} shopName={ctx.shop.shop.name} proofPages={[0]} />}

          <div className="actions">
            <button type="button" className={order ? 'ghost-btn wide-btn' : 'primary'} onClick={download} disabled={building || !plan.fits}>
              {building ? 'Making the file…' : `Download print-ready PDF${parts > 1 ? ` (${parts} pages)` : ''}`}
            </button>
            {(error || loadError) && <p className="error">{error || loadError}</p>}
            <FileDrop onFiles={onFiles} busy={busy} compact />
          </div>
        </section>
      </div>
    </main>
  );
}
