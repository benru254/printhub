// Smart defaults for the Cards tool.
// Every advanced value starts on AUTO. When the user changes one it becomes
// MANUAL (stored in `overrides`). Everything still on auto recalculates around it.

import { round1 } from '../../core/units.js';
import { DEFAULT_PRINTER, effectiveMargins, uniformMargins, maxMargin } from '../../core/printers.js';

export const CARD_DEFAULTS = {
  sheet: 'A3',
  orientation: 'portrait',
  marks: true,
  copies: 100,
  size: null, // null = original size, or { w, h } in mm
  fitMode: 'fill', // used when the new size has a different shape
  makeBleed: 'auto', // 'auto' | 'mirror' | 'stretch' | 'off'  (only used when the file has no bleed)
};

export const STANDARD_BLEED = 3; // mm, the print industry standard
export const MAX_BLEED = 5;
export const STANDARD_SAFE = 3; // mm, keep text this far inside the cut

export const ADVANCED_FIELDS = ['margin', 'bleed', 'gap', 'safe', 'allowRotate'];

/**
 * availBleed: most bleed the design can give at the chosen size (from artFit).
 * printer: the active printer profile (margins come from it).
 * Returns the final settings plus `auto` (what each advanced value would be on auto).
 */
export function resolveSettings(base, overrides = {}, { availBleed = 0, printer = DEFAULT_PRINTER, twoSided = false } = {}) {
  const autoBleed = Math.min(availBleed, STANDARD_BLEED);
  const bleed = overrides.bleed !== undefined ? overrides.bleed : autoBleed;
  const bleedUsed = Math.min(bleed, availBleed);
  const printerMargins = effectiveMargins(printer, { twoSided });

  const auto = {
    margin: maxMargin(printerMargins),
    bleed: autoBleed,
    // With bleed: place pieces bleed-to-bleed. Without: a 3 mm gap for easy cutting.
    gap: bleedUsed > 0 ? round1(bleedUsed * 2) : 3,
    safe: STANDARD_SAFE,
    allowRotate: true,
  };
  const pick = (key) => (overrides[key] !== undefined ? overrides[key] : auto[key]);

  return {
    ...base,
    margin: pick('margin'),
    margins: overrides.margin !== undefined ? uniformMargins(overrides.margin) : printerMargins,
    printerMargins,
    bleed,
    bleedUsed,
    gap: pick('gap'),
    safe: pick('safe'),
    allowRotate: pick('allowRotate'),
    availBleed,
    auto,
  };
}
