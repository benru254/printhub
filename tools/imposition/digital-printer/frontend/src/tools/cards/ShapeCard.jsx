import { buildCutSvg, fmtMm } from '@engine';
import Segmented from '../../components/Segmented.jsx';
import { downloadBytes } from '../../lib/download.js';

const RADII = [2, 3, 5, 8];

const CUTTERS = [
  { value: 'guillotine', label: 'Guillotine' },
  { value: 'plotter', label: 'Sticker cutter' },
];

// Shape of each piece (square corners, rounded, round) and how it will be cut.
export default function ShapeCard({ plan, base, onChange, fileName }) {
  const { out, shape } = plan;
  const square = Math.abs(out.w - out.h) < 0.5;
  const shapes = [
    { value: 'rect', label: 'Square corners' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'ellipse', label: square ? 'Circle' : 'Oval' },
  ];

  const downloadSvg = () => {
    const svg = buildCutSvg(plan.layout, out, shape, { title: `${fileName} cut lines` });
    downloadBytes(new TextEncoder().encode(svg), `${fileName}_cut-lines_${plan.layout.count}up_${plan.sheet.label}.svg`, 'image/svg+xml');
  };

  return (
    <div className="card">
      <div className="field-label">Shape</div>
      <Segmented options={shapes} value={shape.shape} onChange={(v) => onChange({ shape: v })} label="Shape" />

      {shape.shape === 'rounded' && (
        <>
          <div className="field-label spaced">Corner size</div>
          <div className="chips chips-4">
            {RADII.map((r) => (
              <button key={r} type="button" className={`chip ${Math.abs(shape.radius - r) < 0.05 ? 'chip-on' : ''}`} onClick={() => onChange({ radius: r })}>
                <span>{r} mm</span>
              </button>
            ))}
          </div>
          <label className="ps-field spaced">
            <span className="hint">Or type the corner radius (mm)</span>
            <input
              className="num"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={base.radius}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (e.target.value !== '' && v >= 0 && v <= 100) onChange({ radius: v });
              }}
            />
          </label>
        </>
      )}

      <div className="field-label spaced">Cut with</div>
      <Segmented
        options={CUTTERS}
        value={shape.cutter}
        onChange={(v) => onChange({ cutter: v, marks: v !== 'plotter' })}
        label="Cut with"
      />
      <p className="hint">
        {shape.cutter === 'plotter'
          ? 'A sticker cutter (plotter) follows the cut line around every piece. Cut marks are turned off; the cut line is added to the PDF.'
          : shape.shape === 'rect'
            ? 'Straight cuts on a guillotine, using the cut marks.'
            : `Straight cuts on a guillotine, then shape the corners${shape.shape === 'rounded' ? ` (${fmtMm(shape.radius)} mm corner cutter)` : ''}.`}
      </p>

      {shape.cutter === 'plotter' && (
        <div className="cut-files">
          <button type="button" className="ghost-btn" onClick={downloadSvg} disabled={!plan.layout.count}>
            Download cut lines (SVG)
          </button>
          <p className="hint">For Silhouette Studio, Cricut and Inkscape. Same sheet size and positions as the PDF.</p>
        </div>
      )}
    </div>
  );
}
