// The full plan for a LARGE FORMAT job: banners, roll-ups, vinyl, canvas, big posters.
// ONE function used by the screen and the PDF builder, so they always agree.
//
// Words used here:
//   finished : the size the customer gets (after hemming and trimming)
//   extra    : material added around the finished size: bleed to trim off, a hem to fold
//              back and weld, or a pole pocket at the top and bottom
//   print    : finished + extra = what the printer really prints
//   panel    : one printed piece. A print wider than the roll is split into panels that
//              overlap a little so they can be joined. On cut sheets the panels are tiles.

import { computeArtFit } from '../../core/artFit.js';
import { eyeletPoints, EYELET_SPACING } from './finish.js';

export const LF_SLUG = 8; // mm strip around each panel for cut marks and the label
export const PDF_MAX_MM = 5000; // most programs cannot open a page longer than about 5 m
export const LF_LIMITS = { min: 50, max: 50000 };

export const LF_DEFAULTS = {
  w: 1000, // finished size, mm
  h: 2000,
  copies: 1,
  fitMode: 'fill', // how the design fills the finished size (see core/artFit.js)
  media: 'roll', // 'roll' (width fixed, any length) | 'sheet' (cut sheets, tiled)
  rollWidth: 1520, // mm
  sheetW: 297, // mm, for media 'sheet'
  sheetH: 420,
  edge: 5, // mm at each edge of the roll or sheet the printer cannot print
  overlap: 20, // mm shared by neighbouring panels, for joining
  bleed: 3, // mm trimmed off when there is no hem
  hem: 0, // mm folded back on every side (banners: 25). 0 = no hem
  pocketTop: 0, // mm of extra material for a pole pocket
  pocketBottom: 0,
  eyelets: false,
  eyeletSpacing: EYELET_SPACING,
  marks: true, // cut marks, join lines and a label on every panel
  allowRotate: true, // turn the print on the roll when that needs fewer panels or less material
  edgeFill: 'auto', // what fills the extra: 'auto' (mirror the design's edges) | 'white'
};

// The finishing a customer chose for a product -> the settings above.
export function finishToSettings(finish = {}) {
  return {
    hem: finish.hem ? 25 : 0,
    eyelets: !!finish.eyelets,
    pocketTop: finish.pockets ? 75 : 0,
    pocketBottom: finish.pockets ? 75 : 0,
  };
}

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// How many panels a length needs when each panel can be `max` long and they overlap.
export function splitCount(total, max, overlap) {
  if (max <= overlap) return Infinity;
  if (total <= max + 0.01) return 1;
  return Math.ceil((total - overlap) / (max - overlap) - 1e-9);
}

// The length of each of n equal panels that together cover `total` with `overlap` between them.
export const panelLength = (total, n, overlap) => (total + (n - 1) * overlap) / n;

// Print resolution a viewer needs. Big prints are seen from further away, so they need less.
export function largeQuality(dpi, longSideMm) {
  if (dpi == null) return null;
  const need = longSideMm >= 1500 ? { good: 60, ok: 30 } : longSideMm >= 600 ? { good: 100, ok: 60 } : { good: 180, ok: 120 };
  if (dpi >= need.good) return { level: 'good', label: 'Good quality' };
  if (dpi >= need.ok) return { level: 'ok', label: 'OK from a few steps away' };
  return { level: 'poor', label: 'Low quality, will look blurry' };
}

/**
 * geometry: from readPdfGeometry (page 1 is used).  imageInfo: when the file is a picture.
 * base: LF_DEFAULTS with the job's values.
 */
export function planLargeFormat({ geometry, imageInfo = null, base = {} }) {
  const b = { ...LF_DEFAULTS, ...base };
  const page = geometry.pages[0];
  const w = clamp(b.w, LF_LIMITS.min, LF_LIMITS.max, LF_DEFAULTS.w);
  const h = clamp(b.h, LF_LIMITS.min, LF_LIMITS.max, LF_DEFAULTS.h);
  const overlap = clamp(b.overlap, 0, 200, LF_DEFAULTS.overlap);
  const edge = clamp(b.edge, 0, 100, LF_DEFAULTS.edge);
  const hem = clamp(b.hem, 0, 200, 0);
  const side = hem > 0 ? hem : clamp(b.bleed, 0, 50, LF_DEFAULTS.bleed);
  const extra = {
    top: clamp(b.pocketTop, 0, 500, 0) || side,
    right: side,
    bottom: clamp(b.pocketBottom, 0, 500, 0) || side,
    left: side,
  };
  const print = { w: w + extra.left + extra.right, h: h + extra.top + extra.bottom };

  const fit = computeArtFit({ srcW: page.trimMm.w, srcH: page.trimMm.h, srcBleed: page.bleedMm, outW: w, outH: h, mode: b.fitMode });
  const maxExtra = Math.max(extra.top, extra.right, extra.bottom, extra.left);
  // The design's own bleed is used first; what it cannot cover is mirrored (or left white).
  const artBleed = Math.min(fit.maxBleed, maxExtra);
  const covered = fit.maxBleed >= maxExtra - 0.05;
  const fill = covered ? 'art' : b.edgeFill === 'white' || b.fitMode === 'fit' ? 'white' : 'mirror';

  const slug = b.marks ? LF_SLUG : 0;
  let panels = [];
  let cols = 1;
  let rows = 1;
  let across = 'w'; // which finished side runs across the roll
  let pageSize = null; // fixed page (cut sheets), else each panel + slug
  let fits = true;

  if (b.media === 'sheet') {
    const options = [
      { sw: Math.min(b.sheetW, b.sheetH), sh: Math.max(b.sheetW, b.sheetH) },
      { sw: Math.max(b.sheetW, b.sheetH), sh: Math.min(b.sheetW, b.sheetH) },
    ].map((o) => {
      const maxW = o.sw - 2 * edge - 2 * slug;
      const maxH = o.sh - 2 * edge - 2 * slug;
      return { ...o, c: splitCount(print.w, maxW, overlap), r: splitCount(print.h, maxH, overlap) };
    });
    const best = options.sort((a, c) => a.c * a.r - c.c * c.r)[0];
    fits = Number.isFinite(best.c * best.r) && best.c * best.r <= 400;
    cols = fits ? best.c : 1;
    rows = fits ? best.r : 1;
    pageSize = { w: best.sw, h: best.sh };
  } else {
    const printable = clamp(b.rollWidth, 100, 6000, LF_DEFAULTS.rollWidth) - 2 * edge - 2 * slug;
    const a = { across: 'w', n: splitCount(print.w, printable, overlap), length: print.h };
    const t = { across: 'h', n: splitCount(print.h, printable, overlap), length: print.w };
    // Fewer panels first (fewer joins), then less material.
    const better = (x, y) => x.n < y.n || (x.n === y.n && x.n * x.length <= y.n * y.length);
    const pick = b.allowRotate && !better(a, t) ? t : a;
    fits = Number.isFinite(pick.n) && pick.n <= 60;
    across = pick.across;
    if (fits && pick.across === 'w') cols = pick.n;
    if (fits && pick.across === 'h') rows = pick.n;
  }

  const pw = panelLength(print.w, cols, overlap);
  const ph = panelLength(print.h, rows, overlap);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      panels.push({ index: panels.length, col: c, row: r, x: c * (pw - overlap), y: r * (ph - overlap), w: pw, h: ph });
    }
  }
  if (!fits) panels = [];

  const pageW = pageSize ? pageSize.w : pw + 2 * slug;
  const pageH = pageSize ? pageSize.h : ph + 2 * slug;
  const scale = Math.max(pageW, pageH) > PDF_MAX_MM ? 0.1 : 1;

  const copies = Math.max(1, Math.floor(Number(b.copies)) || 1);
  // Roll used: every panel of every copy, one after the other, with a small gap.
  const runLength = across === 'w' ? ph : pw;
  const mediaLength = b.media === 'sheet' ? 0 : copies * panels.length * (runLength + 2 * slug + 10);

  const info = imageInfo && imageInfo[0];
  const dpi = info ? Math.round(Math.min((info.px.w * 25.4) / ((page.trimMm.w + 2 * page.bleedMm) * fit.sx), (info.px.h * 25.4) / ((page.trimMm.h + 2 * page.bleedMm) * fit.sy))) : null;

  return {
    page, fit, finished: { w, h }, extra, print, hem, artBleed, fill, covered,
    media: b.media === 'sheet' ? 'sheet' : 'roll',
    rollWidth: b.rollWidth, across, cols, rows, panels, overlap, slug, edge,
    panel: { w: pw, h: ph }, pageSize: { w: pageW, h: pageH }, scale, fits,
    copies, mediaLength, finishedSqm: (w * h * copies) / 1e6, mediaSqm: b.media === 'sheet' ? (panels.length * copies * pageW * pageH) / 1e6 : (mediaLength * b.rollWidth) / 1e6,
    eyelets: b.eyelets ? eyeletPoints(w, h, { spacing: clamp(b.eyeletSpacing, 100, 2000, EYELET_SPACING) }) : [],
    marks: !!b.marks,
    dpi, quality: largeQuality(dpi, Math.max(w, h)),
    settings: b,
  };
}
