// The full plan for a Cards job: finished size, how the design fits, settings and sheet layout.
// ONE function used by the screen, the PDF builder and (later) the API and bots,
// so they always agree.

import { getSheet, orientSheet } from '../../core/sheets.js';
import { computeArtFit } from '../../core/artFit.js';
import { DEFAULT_PRINTER } from '../../core/printers.js';
import { computeStepRepeat } from './layout.js';
import { resolveSettings, MAX_BLEED, STANDARD_BLEED } from './settings.js';

/**
 * inkTouches: true when the design's colour reaches its edges (from the picture check).
 * It decides whether "auto" makes bleed for a file that has none.
 */
export function planCards({ geometry, base, overrides = {}, customSheets = [], printer = DEFAULT_PRINTER, inkTouches = false }) {
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

  const layoutFor = (sheet) =>
    computeStepRepeat({
      sheetW: sheet.w,
      sheetH: sheet.h,
      itemW: out.w,
      itemH: out.h,
      margins: settings.margins,
      gap: settings.gap,
      bleed: settings.bleedUsed,
      marks: settings.marks,
      allowRotate: settings.allowRotate,
    });

  const sheet = orientSheet(getSheet(base.sheet, customSheets), base.orientation);
  const layout = layoutFor(sheet);
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
