import { useMemo, useState } from 'react';
import { detectProduct, planCards, cardStartState, defaultKey } from '@engine';
import { TOOLS } from '../tools/registry.js';
import ToolIcon from '../tools/ToolIcon.jsx';
import Thumb from '../components/Thumb.jsx';
import PageViewer from '../components/PageViewer.jsx';
import FileDrop from '../components/FileDrop.jsx';
import FileFacts from './FileFacts.jsx';
import { store } from '../lib/storage.js';

const MAX_THUMBS = 24;

// Screen 2: see your file, its facts, and choose what to make.
export default function OverviewScreen({ job, onOpenTool, onFiles, busy, error, customSheets, printer }) {
  const { geometry, pdf } = job;
  const [viewing, setViewing] = useState(null);
  const first = geometry.pages[0];
  const product = detectProduct(first.trimMm, geometry.pageCount);

  // Quick preview of the Cards tool result on the chosen printer, e.g. "21 per A3 sheet".
  const cardsPreview = useMemo(() => {
    try {
      const saved = store.get('cardDefaults', {})[defaultKey(printer.id, product.kind)] || null;
      const { base, overrides } = cardStartState(printer, saved);
      return planCards({ geometry, base, overrides, customSheets, printer });
    } catch {
      return null;
    }
  }, [geometry, customSheets, printer, product.kind]);

  const thumbs = geometry.pages.slice(0, MAX_THUMBS);
  const more = geometry.pageCount - thumbs.length;

  return (
    <main className="overview">
      <section className="ov-files">
        <div className="ov-head">
          <h1 className="ov-title">{job.name}</h1>
          <p className="hint">Tap a page to see it bigger.</p>
        </div>
        <div className={`thumbs ${geometry.pageCount <= 2 ? 'thumbs-big' : ''}`}>
          {thumbs.map((p) => (
            <Thumb key={p.index} pdf={pdf} page={p} onOpen={() => setViewing(p.index)} />
          ))}
          {more > 0 && <div className="thumb-more">+{more} more pages</div>}
        </div>
      </section>

      <section className="ov-side">
        <FileFacts job={job} product={product} />

        <div className="card">
          <h2 className="section-title">What do you want to make?</h2>
          <div className="tools">
            {TOOLS.map((t) => {
              const ready = t.status === 'ready';
              const recommended = t.id === product.recommended;
              let line = t.desc;
              if (t.id === 'cards' && cardsPreview) {
                const { layout, sheet } = cardsPreview;
                line = layout.count > 0 ? `${layout.count} per ${sheet.label} sheet on ${printer.name}` : t.desc;
              }
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tool ${ready ? '' : 'tool-soon'} ${recommended ? 'tool-rec' : ''}`}
                  disabled={!ready}
                  onClick={() => onOpenTool(t.id)}
                >
                  <ToolIcon id={t.id} />
                  <span className="tool-text">
                    <span className="tool-name">
                      {t.name}
                      {recommended && <span className="badge badge-rec">Recommended</span>}
                      {!ready && <span className="badge">Soon</span>}
                    </span>
                    <span className="tool-desc">{line}</span>
                  </span>
                  {ready && <span className="tool-go" aria-hidden>›</span>}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <FileDrop onFiles={onFiles} busy={busy} compact />
      </section>

      {viewing !== null && (
        <PageViewer pdf={pdf} pages={geometry.pages} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </main>
  );
}
