// Library of standard print sizes (mm). Used to recognise what a file is
// and to guess bleed. short = short side, long = long side.

export const STANDARD_SIZES = [
  { id: 'card-85x55', name: 'Business card 85 × 55', short: 55, long: 85, kind: 'card' },
  { id: 'card-85x50', name: 'Business card 85 × 50', short: 50, long: 85, kind: 'card' },
  { id: 'card-90x50', name: 'Business card 90 × 50', short: 50, long: 90, kind: 'card' },
  { id: 'card-90x55', name: 'Business card 90 × 55', short: 55, long: 90, kind: 'card' },
  { id: 'card-us', name: 'US business card', short: 50.8, long: 88.9, kind: 'card' },
  { id: 'card-id', name: 'ID card size', short: 54, long: 85.6, kind: 'card' },
  { id: 'A7', name: 'A7', short: 74, long: 105, kind: 'paper' },
  { id: 'A6', name: 'A6', short: 105, long: 148, kind: 'paper' },
  { id: 'A5', name: 'A5', short: 148, long: 210, kind: 'paper' },
  { id: 'A4', name: 'A4', short: 210, long: 297, kind: 'paper' },
  { id: 'A3', name: 'A3', short: 297, long: 420, kind: 'paper' },
  { id: 'A2', name: 'A2', short: 420, long: 594, kind: 'paper' },
  { id: 'A1', name: 'A1', short: 594, long: 841, kind: 'paper' },
  { id: 'A0', name: 'A0', short: 841, long: 1189, kind: 'paper' },
  { id: 'SRA3', name: 'SRA3', short: 320, long: 450, kind: 'paper' },
  { id: 'DL', name: 'DL', short: 99, long: 210, kind: 'paper' },
  { id: 'Letter', name: 'Letter', short: 215.9, long: 279.4, kind: 'paper' },
  { id: 'Legal', name: 'Legal', short: 215.9, long: 355.6, kind: 'paper' },
  { id: 'Tabloid', name: 'Tabloid', short: 279.4, long: 431.8, kind: 'paper' },
];

// Sizes offered as quick picks in "Print size".
export const CARD_PRESETS = ['card-85x55', 'card-85x50', 'card-90x50', 'card-90x55', 'A7', 'A6'];
export const PAPER_PRESETS = ['A6', 'A5', 'DL', 'A4', 'A3'];

export function getStandard(id) {
  return STANDARD_SIZES.find((s) => s.id === id) || null;
}

// Closest standard size within `tol` mm (either orientation), or null.
export function matchStandard(w, h, tol = 1.5) {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  let best = null;
  let bestErr = Infinity;
  for (const z of STANDARD_SIZES) {
    const err = Math.max(Math.abs(short - z.short), Math.abs(long - z.long));
    if (err <= tol && err < bestErr) {
      best = z;
      bestErr = err;
    }
  }
  return best;
}

export function orientationOf(w, h) {
  if (Math.abs(w - h) < 0.5) return 'square';
  return w > h ? 'landscape' : 'portrait';
}
