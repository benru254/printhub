// Guesses WHAT the customer is making from the finished size and page count,
// so the app can describe the job in plain words and recommend the right tool.

import { matchStandard, orientationOf } from './sizes.js';
import { fmtSize } from './units.js';

const BIG = new Set(['A3', 'A2', 'A1', 'A0', 'SRA3', 'Tabloid']);
const DOCUMENT = new Set(['A5', 'A4', 'Letter', 'Legal']);

export function detectProduct(trimMm, pageCount = 1) {
  const p = detectBySize(trimMm, pageCount);
  // Many pages of small pieces (tickets, badges, cards): keep them in order with Cut & Stack.
  if (pageCount > 2 && ['business-card', 'small-flyer', 'small-item'].includes(p.kind)) return { ...p, recommended: 'cutstack' };
  return p;
}

function detectBySize(trimMm, pageCount) {
  const { w, h } = trimMm;
  const std = matchStandard(w, h);
  const base = {
    size: fmtSize(w, h),
    sizeName: std ? std.name : null,
    orientation: orientationOf(w, h),
    recommended: 'cards',
  };

  if (std?.kind === 'card') {
    return { ...base, kind: 'business-card', label: 'Business cards', unit: 'cards' };
  }
  if (std && (std.id === 'A7' || std.id === 'A6')) {
    return { ...base, kind: 'small-flyer', label: `${std.name} flyers & postcards`, unit: 'pieces' };
  }
  if (std?.id === 'DL') {
    return { ...base, kind: 'flyer', label: 'DL flyers', unit: 'flyers' };
  }
  if (std && DOCUMENT.has(std.id)) {
    if (pageCount > 2) {
      return {
        ...base,
        kind: 'document',
        label: `${std.name} document`,
        unit: 'copies',
        recommended: pageCount % 4 === 0 ? 'booklet' : 'cards',
      };
    }
    return { ...base, kind: 'flyer', label: `${std.name} flyers`, unit: 'flyers' };
  }
  if (std && BIG.has(std.id)) {
    return { ...base, kind: 'poster', label: `${std.name} posters`, unit: 'posters' };
  }
  if (Math.max(w, h) <= 150) {
    return { ...base, kind: 'small-item', label: 'Labels, stickers or tickets', unit: 'pieces' };
  }
  return { ...base, kind: 'custom', label: 'Custom size prints', unit: 'copies' };
}
