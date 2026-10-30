// CONTOUR CUT: a cut line that follows the outline of the design (die-cut stickers).
//
// Works on the finished piece as pixels (RGBA), so it runs in the browser and on the server:
//   1. find the design: everything that is not background (transparent, or white paper)
//   2. grow it by the border (e.g. 2 mm of white around the design)
//   3. fill holes (only the outside is cut, not the inside of letters)
//   4. trace the edge, simplify it and smooth it
// Result: outlines in mm, origin = top-left of the finished piece (same as shapes.js).

const SQRT2 = Math.SQRT2;

/**
 * 1 = design, 0 = background.
 * ignoreWhite: near-white pixels count as background (for JPG and white-background PDFs).
 */
export function designMask({ data, width, height, ignoreWhite = true, whiteLevel = 242, alphaLevel = 24 }) {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (data[p + 3] < alphaLevel) continue;
    if (ignoreWhite && data[p] >= whiteLevel && data[p + 1] >= whiteLevel && data[p + 2] >= whiteLevel) continue;
    mask[i] = 1;
  }
  return mask;
}

// Distance (in pixels) from every pixel to the nearest design pixel (two-pass chamfer).
export function distanceToDesign(mask, width, height) {
  const INF = 1e9;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 1);
        if (x > 0) v = Math.min(v, d[i - width - 1] + SQRT2);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + SQRT2);
      }
      d[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 1);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + SQRT2);
        if (x > 0) v = Math.min(v, d[i + width - 1] + SQRT2);
      }
      d[i] = v;
    }
  }
  return d;
}

// Fills holes: anything not reachable from the picture border through background becomes design.
export function fillHoles(mask, width, height) {
  const outside = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    const i = y * width + x;
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  const filled = new Uint8Array(width * height);
  for (let i = 0; i < filled.length; i++) filled[i] = outside[i] ? 0 : 1;
  return filled;
}

/**
 * Traces the outer edges of a mask (marching squares). Returns closed polygons in pixel
 * coordinates: [[{x, y}, ...], ...]. The mask is treated as surrounded by background.
 */
export function traceOutlines(mask, width, height) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0);
  // Segments between edge midpoints of each 2x2 cell. Points are keyed on a half-pixel grid.
  const next = new Map();
  const key = (x2, y2) => y2 * (2 * width + 6) + x2 + 2;
  const add = (ax, ay, bx, by) => next.set(key(ax, ay), [bx, by, key(bx, by)]);
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const c = tl * 8 + tr * 4 + br * 2 + bl;
      if (c === 0 || c === 15) continue;
      // edge midpoints, doubled to stay whole numbers: top, right, bottom, left
      const T = [2 * x + 1, 2 * y];
      const R = [2 * x + 2, 2 * y + 1];
      const B = [2 * x + 1, 2 * y + 2];
      const L = [2 * x, 2 * y + 1];
      // Direction keeps the design on the left; saddles (5, 10) are split apart.
      switch (c) {
        case 1: add(...B, ...L); break;
        case 2: add(...R, ...B); break;
        case 3: add(...R, ...L); break;
        case 4: add(...T, ...R); break;
        case 5: add(...T, ...L); add(...B, ...R); break;
        case 6: add(...T, ...B); break;
        case 7: add(...T, ...L); break;
        case 8: add(...L, ...T); break;
        case 9: add(...B, ...T); break;
        case 10: add(...L, ...B); add(...R, ...T); break;
        case 11: add(...R, ...T); break;
        case 12: add(...L, ...R); break;
        case 13: add(...B, ...R); break;
        case 14: add(...L, ...B); break;
        default: break;
      }
    }
  }
  const polygons = [];
  for (const startKey of next.keys()) {
    if (!next.has(startKey)) continue;
    const poly = [];
    let k = startKey;
    let guard = 0;
    while (next.has(k) && guard++ < 1e7) {
      const [bx, by, nk] = next.get(k);
      next.delete(k);
      poly.push({ x: bx / 2, y: by / 2 });
      k = nk;
    }
    if (poly.length >= 3) polygons.push(poly);
  }
  return polygons;
}

// Ramer-Douglas-Peucker on a closed polygon.
export function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const sq = tolerance * tolerance;
  const distSq = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    let t = len ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = a.x + t * dx - p.x;
    const ey = a.y + t * dy - p.y;
    return ex * ex + ey * ey;
  };
  const rdp = (pts) => {
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let max = 0;
      let idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = distSq(pts[i], pts[s], pts[e]);
        if (d > max) {
          max = d;
          idx = i;
        }
      }
      if (idx > 0 && max > sq) {
        keep[idx] = 1;
        stack.push([s, idx], [idx, e]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };
  // Split the ring at its farthest point from the start, simplify both halves.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = rdp(points.slice(0, far + 1));
  const b = rdp([...points.slice(far), points[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

// Chaikin smoothing on a closed polygon (rounds off pixel steps).
export function smooth(points, rounds = 2) {
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    pts = out;
  }
  return pts;
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

/**
 * The whole contour cut, from the finished piece's pixels.
 * offsetMm: white border around the design. Returns:
 *   { outlines: [[{op,x,y}...]] (mm), coverage (share of piece covered by the design),
 *     pieces (number of separate cut lines) }
 */
export function contourFromPixels({ data, width, height, pxPerMm, offsetMm = 2, ignoreWhite = true, minAreaMm2 = 4 }) {
  const mask = designMask({ data, width, height, ignoreWhite });
  let designPx = 0;
  for (let i = 0; i < mask.length; i++) designPx += mask[i];
  const coverage = designPx / mask.length;
  if (!designPx) return { outlines: [], coverage: 0, pieces: 0 };

  const r = Math.max(0, offsetMm * pxPerMm);
  const grown = new Uint8Array(mask.length);
  if (r > 0.5) {
    const d = distanceToDesign(mask, width, height);
    for (let i = 0; i < d.length; i++) grown[i] = d[i] <= r ? 1 : 0;
  } else {
    grown.set(mask);
  }
  const solid = fillHoles(grown, width, height);
  const polys = traceOutlines(solid, width, height);

  const tol = Math.max(0.6, 0.12 * pxPerMm); // about 0.12 mm
  const outlines = [];
  for (const poly of polys) {
    if (polygonArea(poly) / (pxPerMm * pxPerMm) < minAreaMm2) continue; // dust
    const pts = smooth(simplify(poly, tol), 2);
    const clamp = (v, max) => Math.min(max, Math.max(0, v));
    const mm = pts.map((p) => ({ x: clamp(p.x / pxPerMm, width / pxPerMm), y: clamp(p.y / pxPerMm, height / pxPerMm) }));
    const outline = [{ op: 'M', x: mm[0].x, y: mm[0].y }];
    for (let i = 1; i < mm.length; i++) outline.push({ op: 'L', x: mm[i].x, y: mm[i].y });
    outline.push({ op: 'Z' });
    outlines.push(outline);
  }
  return { outlines, coverage, pieces: outlines.length };
}
