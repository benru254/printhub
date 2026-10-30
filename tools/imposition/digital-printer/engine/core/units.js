// Unit helpers. The whole engine works in millimetres (mm).
// PDF files use points (pt): 72 pt = 1 inch = 25.4 mm.

export const PT_PER_MM = 72 / 25.4;

export const mmToPt = (mm) => mm * PT_PER_MM;
export const ptToMm = (pt) => pt / PT_PER_MM;

// Round to 0.1 mm (more than enough for print layout).
export const round1 = (n) => Math.round(n * 10) / 10;
// Round DOWN to 0.1 mm (the tiny 1e-6 stops 2.9999999 becoming 2.9).
export const floor1 = (n) => Math.floor(n * 10 + 1e-6) / 10;

// 85 -> "85", 85.04 -> "85", 88.9 -> "88.9"
export function fmtMm(n) {
  const r = round1(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export const fmtSize = (w, h) => `${fmtMm(w)} × ${fmtMm(h)} mm`;
