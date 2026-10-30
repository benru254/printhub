import { fmtMm, fmtSize, imageDpi, qualityOf, pageRanges, matchStandard } from '@engine';
import { fileSizeText } from '../lib/loadFiles.js';

// The important facts about the customer's file, in plain words.
export default function FileFacts({ job, product }) {
  const { geometry, imageInfo } = job;
  const first = geometry.pages[0];
  const groups = geometry.sizeGroups;
  const mixed = groups.length > 1;
  const std = matchStandard(first.trimMm.w, first.trimMm.h);
  const orientation = product.orientation === 'square' ? 'square' : product.orientation;

  const rows = [];
  rows.push({
    label: 'Pages',
    value: geometry.pageCount === 2 ? '2 (front and back)' : String(geometry.pageCount),
  });
  rows.push({
    label: mixed ? 'Size (page 1)' : 'Finished size',
    value: (
      <>
        <strong>{fmtSize(first.trimMm.w, first.trimMm.h)}</strong>
        <span className="fact-sub"> · {std ? `${std.name} · ` : ''}{orientation}</span>
      </>
    ),
  });
  rows.push({ label: 'Looks like', value: product.label });
  rows.push({
    label: 'Bleed',
    value:
      first.bleedMm > 0
        ? `${fmtMm(first.bleedMm)} mm${first.source === 'guess' ? ' (found)' : ''} · file is ${fmtSize(first.trimMm.w + 2 * first.bleedMm, first.trimMm.h + 2 * first.bleedMm)}`
        : 'None',
  });

  if (imageInfo) {
    const i0 = imageInfo[0];
    const dpi = imageDpi(i0, first);
    const q = qualityOf(dpi);
    rows.push({
      label: 'Picture',
      value: (
        <>
          {i0.px.w} × {i0.px.h} px · {dpi} dpi at this size
          <span className={`quality quality-${q.level}`}>{q.label}</span>
        </>
      ),
    });
  }

  rows.push({
    label: 'File',
    value:
      job.sourceType === 'pdf'
        ? `PDF · ${fileSizeText(job.fileSize)}`
        : `${job.fileCount} ${job.fileCount === 1 ? 'picture' : 'pictures'} · ${fileSizeText(job.fileSize)}`,
  });

  return (
    <div className="card facts">
      <h2 className="section-title">Your file</h2>
      <dl className="fact-list">
        {rows.map((r) => (
          <div className="fact" key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {mixed && (
        <div className="note note-caution facts-note">
          <span className="note-icon" aria-hidden>!</span>
          <div className="note-body">
            <div className="note-title">Pages have different sizes</div>
            <div className="note-text">
              {groups.map((g) => (
                <div key={g.pages[0]}>
                  {g.pages.length === 1 ? 'Page' : 'Pages'} {pageRanges(g.pages)}: {fmtSize(g.w, g.h)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
