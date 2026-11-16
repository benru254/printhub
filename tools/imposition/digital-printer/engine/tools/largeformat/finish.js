// Finishing of large prints: where the eyelets (hanging rings) go.
// Pure numbers only, so the price (server) and the print file (app) always agree.

export const EYELET_SPACING = 500; // mm between eyelets
export const EYELET_INSET = 20; // mm in from the finished edge
export const EYELET_HOLE = 10; // mm, the printed mark

// Eyelets around the edge of a w × h banner: one in every corner, the rest spread evenly.
// Returns their centres in mm from the top-left of the FINISHED size.
export function eyeletPoints(w, h, { spacing = EYELET_SPACING, inset = EYELET_INSET } = {}) {
  const i = Math.min(inset, w / 4, h / 4);
  const nx = Math.max(1, Math.round((w - 2 * i) / spacing));
  const ny = Math.max(1, Math.round((h - 2 * i) / spacing));
  const points = [];
  for (let k = 0; k <= nx; k++) {
    const x = i + ((w - 2 * i) * k) / nx;
    points.push({ x, y: i }, { x, y: h - i });
  }
  for (let k = 1; k < ny; k++) {
    const y = i + ((h - 2 * i) * k) / ny;
    points.push({ x: i, y }, { x: w - i, y });
  }
  return points;
}

export const eyeletCount = (w, h, options) => eyeletPoints(w, h, options).length;
