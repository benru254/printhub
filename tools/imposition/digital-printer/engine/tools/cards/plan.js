// The full plan for a Cards job: finished size, how the design fits, settings and sheet layout.
// ONE function used by the screen, the PDF builder and (later) the API and bots,
// so they always agree.

import { getSheet, orientSheet } from '../../core/sheets.js';
import { computeArtFit } from '../../core/artFit.js';
import { DEFAULT_PRINTER } from '../../core/printers.js';
import { clampRadius } from '../../core/shapes.js';
import { computeStepRepeat } from './layout.js';
import { resolveSettings, MAX_BLEED, STANDARD_BLEED } from './settings.js';

/**
 * inkTouches: true when the design's colour reaches its edges (from the picture check).
 * It decides whether "auto" makes bleed for a file that has none.
 */
/**
 * contour: for shape 'contour', the cut lines found around the design
 * ({ outlines, coverage, pieces } from contourFromPixels), or null while they are being found.
 */
export function planCards({ geometry, base, overrides = {}, customSheets = [], printer = DEFAULT_PRINTER, inkTouches = false, contour = null }) {
  const sides = geometry.pages.slice(0, 2);
  const first = sides[0];
  const twoSided = sides.length >= 2;

  const out = base.size ? { w: base.size.w, h: base.size.h } : { w: first.trimMm.w, h: first.trimMm.h };
  const mode = base.size ? base.fitMode : 'fill';

  const fits = sides.map((p) =>
    computeArtFit({ srcW: p.trimMm.w, srcH: p.trimMm.h, srcBleed: p.bleedMm, outW: out.w, outH: out.h, mode })
  );
  const sourceBleed = Math.min(MAX_BLEED, ...fits.map((f) => f.maxBleed));

  // Make bleed when the file doesn't have enough: always for mirror/stretch,
  // and on "auto" only when colour touches the edge (white edges don't need it).
  const needsBleed = sourceBleed < STANDARD_BLEED - 0.05;
  const choice = base.makeBleed || 'auto';
  let madeBleed = null;
  if (needsBleed && (choice === 'mirror' || choice === 'stretch')) madeBleed = choice;
  else if (needsBleed && choice === 'auto' && inkTouches) madeBleed = 'mirror';

  const availBleed = madeBleed ? MAX_BLEED : sourceBleed;
  const settings = resolveSettings(base, overrides, { availBleed, printer, twoSided });

  const layoutWithGap = (sheet, gap) =>
    computeStepRepeat({
      sheetW: sheet.w,
      sheetH: sheet.h,
      itemW: out.w,
      itemH: out.h,
      margins: settings.margins,
      gap,
      bleed: settings.bleedUsed,
      marks: settings.marks,
      allowRotate: settings.allowRotate,
    });

  // Smart gap: without bleed, pieces may share one cut line (gap 0) when that fits more.
  // Only on auto: a gap the user typed is always kept.
  const layoutFor = (sheet) => {
    const normal = layoutWithGap(sheet, settings.gap);
    // Shapes and sticker cutters need space between pieces, so no shared cut lines for them.
    const straight = (base.shape || 'rect') === 'rect' && base.cutter !== 'plotter';
    if (!straight || overrides.gap !== undefined || settings.bleedUsed > 0 || settings.gap === 0) return normal;
    const shared = layoutWithGap(sheet, 0);
    return shared.count > normal.count ? { ...shared, sharedToFit: true } : normal;
  };

  const sheet = orientSheet(getSheet(base.sheet, customSheets), base.orientation);
  const layout = layoutFor(sheet);
  if (layout.gap !== settings.gap) settings.gap = layout.gap; // show the gap really used
  const resized = Math.abs(out.w - first.trimMm.w) > 0.05 || Math.abs(out.h - first.trimMm.h) > 0.05;

  return {
    sides,
    out,
    mode,
    fits,
    availBleed,
    sourceBleed,
    needsBleed,
    madeBleed, // null, 'mirror' or 'stretch'
    inkTouches,
    settings,
    printer,
    flip: printer.flip || 'book',
    shape: {
      shape: ['rounded', 'ellipse', 'contour'].includes(base.shape) ? base.shape : 'rect',
      radius: clampRadius(base.radius ?? 3, out.w, out.h),
      // A cut line that follows the design can only be cut by a sticker cutter.
      cutter: base.cutter === 'plotter' || base.shape === 'contour' ? 'plotter' : 'guillotine',
      offset: base.contourOffset ?? 2,
      outlines: base.shape === 'contour' && contour ? contour.outlines : [],
      coverage: contour ? contour.coverage : null,
      pieces: contour ? contour.pieces : null,
      found: base.shape === 'contour' ? !!contour : true,
    },
    sheet,
    layout,
    layoutFor,
    resized,
    twoSided,
    sheetsNeeded: layout.count ? Math.ceil(settings.copies / layout.count) : 0,
  };
}

// How many pieces fit on each sheet size, for the sheet buttons.
export function countsBySheet(plan, ids, customSheets, orientation) {
  const out = {};
  for (const id of ids) out[id] = plan.layoutFor(orientSheet(getSheet(id, customSheets), orientation)).count;
  return out;
}
