// MAKE BLEED: create the missing bleed by extending the design past its edges.
// Works on pixels (RGBA), so the same code runs in the browser and on the server.
//   mirror  : the outer part of the design is reflected outward (best for photos, patterns, gradients)
//   stretch : the very edge colour is repeated outward (best for plain colours)
// Only the bleed part is made from pixels. In the PDF the real design (sharp text,
// vector shapes) is still drawn on top inside the cut line.

export const BLEED_METHODS = ['mirror', 'stretch'];

/**
 * data: RGBA pixels, width x height. The design fills the inner area;
 * `pad` pixels on every side are empty and get filled.
 */
export function fillBleed(data, width, height, pad, method = 'mirror') {
  if (pad <= 0) return data;
  const x0 = pad;
  const y0 = pad;
  const x1 = width - pad - 1; // last inner column
  const y1 = height - pad - 1; // last inner row
  if (x1 < x0 || y1 < y0) return data;

  const srcX = (x) => {
    if (x >= x0 && x <= x1) return x;
    if (method === 'stretch') return x < x0 ? x0 : x1;
    const m = x < x0 ? x0 + (x0 - 1 - x) : x1 - (x - x1 - 1);
    return Math.min(x1, Math.max(x0, m)); // very thin designs: don't run past the far edge
  };
  const srcY = (y) => {
    if (y >= y0 && y <= y1) return y;
    if (method === 'stretch') return y < y0 ? y0 : y1;
    const m = y < y0 ? y0 + (y0 - 1 - y) : y1 - (y - y1 - 1);
    return Math.min(y1, Math.max(y0, m));
  };

  const copy = (x, y) => {
    const s = (srcY(y) * width + srcX(x)) * 4;
    const d = (y * width + x) * 4;
    data[d] = data[s];
    data[d + 1] = data[s + 1];
    data[d + 2] = data[s + 2];
    data[d + 3] = 255;
  };

  // Top and bottom bands (full width, including corners).
  for (let y = 0; y < height; y++) {
    if (y >= y0 && y <= y1) continue;
    for (let x = 0; x < width; x++) copy(x, y);
  }
  // Left and right bands (inner rows only).
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < x0; x++) copy(x, y);
    for (let x = x1 + 1; x < width; x++) copy(x, y);
  }
  return data;
}

/**
 * How much of each edge has colour on it (not white paper).
 * data: RGBA of the FINISHED piece. Returns { top, right, bottom, left } from 0 to 1,
 * and `touches` = true when colour reaches the edge somewhere that matters.
 */
export function edgeInk({ data, width, height, pxPerMm, depthMm = 0.8, skipX = false, skipY = false }) {
  const depth = Math.max(1, Math.round(depthMm * pxPerMm));
  const inked = (x, y) => {
    const p = (y * width + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max < 238 || max - min > 18; // darker than paper, or clearly coloured
  };
  const share = (x0, y0, x1, y1) => {
    let n = 0;
    let c = 0;
    const step = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 400)); // sample, it's fast enough
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        n++;
        if (inked(x, y)) c++;
      }
    }
    return n ? c / n : 0;
  };
  const ink = {
    top: skipY ? 0 : share(0, 0, width, depth),
    bottom: skipY ? 0 : share(0, height - depth, width, height),
    left: skipX ? 0 : share(0, 0, depth, height),
    right: skipX ? 0 : share(width - depth, 0, width, height),
  };
  return { ...ink, touches: Math.max(ink.top, ink.right, ink.bottom, ink.left) > 0.08 };
}
