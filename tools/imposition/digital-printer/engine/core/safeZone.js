// SAFE ZONE CHECK: is anything important too close to the cut?
// Cutting is never perfect (it can move 1-2 mm), so text and logos should stay
// at least `safeMm` (usually 3 mm) inside the finished edge.
//
// Two checks:
//   1. Text (exact): uses the real text positions inside the PDF.
//   2. Detail (smart guess): looks at the finished piece picture for sharp detail
//      (text in pictures, logos, borders) near the edges.
// All results are in mm in the "piece frame": origin = top-left of the finished piece.

import { PT_PER_MM } from './units.js';

// ---------- 1. Text ----------

/**
 * Converts one PDF text item ({ str, transform:[a,b,c,d,e,f], width, height } in PDF points)
 * to a box on the finished piece, using the same fitting as the output.
 */
export function textBoxOnPiece(item, page, fit) {
  const [a, b, c, d, e, f] = item.transform;
  const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || 1;
  const h = item.height || fontSize;
  const ux = a / (Math.hypot(a, b) || 1);
  const uy = b / (Math.hypot(a, b) || 1);
  const vx = c / (Math.hypot(c, d) || 1);
  const vy = d / (Math.hypot(c, d) || 1);
  const w = item.width || 0;
  // Letters sit on the baseline. Only some letters hang below it (g, j, p, q, y, commas).
  const up = h * 0.75; // capitals and tall letters
  const down = /[gjpqy,;(){}\[\]|_@$]/.test(item.str || '') ? h * 0.22 : 0;

  const corners = [
    [e - vx * down, f - vy * down],
    [e + ux * w - vx * down, f + uy * w - vy * down],
    [e + vx * up, f + vy * up],
    [e + ux * w + vx * up, f + uy * w + vy * up],
  ];

  const t = page.trimBoxPt;
  const tcx = t.x + t.width / 2;
  const tcy = t.y + t.height / 2;
  const toPiece = ([px, py]) => [fit.outW / 2 + ((px - tcx) * fit.sx) / PT_PER_MM, fit.outH / 2 - ((py - tcy) * fit.sy) / PT_PER_MM];
  const pts = corners.map(toPiece);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { str: item.str, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/**
 * boxes: text boxes on the piece. Returns problems, closest first:
 * [{ str, distance, edge, box, cut }]  distance < 0 means part of the text is cut off.
 */
export function checkTextSafety(boxes, { outW, outH, safeMm }) {
  const issues = [];
  for (const b of boxes) {
    if (!b.str || !b.str.trim() || b.w <= 0.05) continue;
    // Completely outside the finished piece (in the bleed or cropped away).
    const outside = b.x + b.w <= 0 || b.x >= outW || b.y + b.h <= 0 || b.y >= outH;
    const dists = { left: b.x, right: outW - (b.x + b.w), top: b.y, bottom: outH - (b.y + b.h) };
    let edge = 'left';
    for (const k of Object.keys(dists)) if (dists[k] < dists[edge]) edge = k;
    const distance = dists[edge];
    if (outside || distance < safeMm - 0.05) {
      issues.push({ str: b.str.trim(), distance: outside ? -Infinity : distance, edge, box: b, cut: outside || distance < 0 });
    }
  }
  return issues.sort((p, q) => p.distance - q.distance);
}

// ---------- 2. Detail near the edges (picture analysis) ----------

const STRONG = 64; // brightness jump (0-255) that counts as a sharp edge
const SEGMENT_MM = 4;
const FLAG_RATIO = 0.03; // 3% sharp pixels in a segment = something is there
const BUSY_RATIO = 0.16; // whole border this busy = photo-like background

/**
 * data: RGBA pixels of the FINISHED piece (no bleed), width x height, pxPerMm.
 * skipX / skipY: don't check left+right / top+bottom (e.g. white strips from "Fit").
 * Returns { busy, regions: [{ edge, x, y, w, h }] } in mm.
 */
export function findEdgeDetail({ data, width, height, pxPerMm, safeMm, ignoreMm = 0.6, skipX = false, skipY = false }) {
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  const sharp = (x, y) => {
    if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) return false;
    const i = y * width + x;
    return Math.abs(lum[i + 1] - lum[i - 1]) > STRONG || Math.abs(lum[i + width] - lum[i - width]) > STRONG;
  };

  const ig = Math.max(1, Math.round(ignoreMm * pxPerMm));
  const sz = Math.max(ig + 1, Math.round(safeMm * pxPerMm));
  const seg = Math.max(4, Math.round(SEGMENT_MM * pxPerMm));

  const bands = [];
  if (!skipY) {
    bands.push({ edge: 'top', horizontal: true, from: ig, to: sz });
    bands.push({ edge: 'bottom', horizontal: true, from: height - sz, to: height - ig });
  }
  if (!skipX) {
    bands.push({ edge: 'left', horizontal: false, from: ig, to: sz });
    bands.push({ edge: 'right', horizontal: false, from: width - sz, to: width - ig });
  }

  let totalSharp = 0;
  let totalPx = 0;
  const flagged = [];

  for (const band of bands) {
    const length = band.horizontal ? width : height;
    for (let s = ig; s < length - ig; s += seg) {
      const e = Math.min(length - ig, s + seg);
      let count = 0;
      let n = 0;
      for (let a = s; a < e; a++) {
        for (let d = band.from; d < band.to; d++) {
          const x = band.horizontal ? a : d;
          const y = band.horizontal ? d : a;
          n++;
          if (sharp(x, y)) count++;
        }
      }
      totalSharp += count;
      totalPx += n;
      if (n && count / n > FLAG_RATIO) flagged.push({ band, s, e });
    }
  }

  const busy = totalPx > 0 && totalSharp / totalPx > BUSY_RATIO;
  if (busy) return { busy: true, regions: [] };

  // Join neighbouring flagged segments into regions (mm).
  const regions = [];
  for (const f of flagged) {
    const last = regions[regions.length - 1];
    if (last && last._band === f.band && f.s <= last._e) {
      last._e = f.e;
    } else {
      regions.push({ _band: f.band, _s: f.s, _e: f.e });
    }
  }
  const W = width / pxPerMm;
  const H = height / pxPerMm;
  const depth = sz / pxPerMm;
  return {
    busy: false,
    regions: regions.map((r) => {
      const a = r._s / pxPerMm;
      const len = (r._e - r._s) / pxPerMm;
      switch (r._band.edge) {
        case 'top':
          return { edge: 'top', x: a, y: 0, w: len, h: depth };
        case 'bottom':
          return { edge: 'bottom', x: a, y: H - depth, w: len, h: depth };
        case 'left':
          return { edge: 'left', x: 0, y: a, w: depth, h: len };
        default:
          return { edge: 'right', x: W - depth, y: a, w: depth, h: len };
      }
    }),
  };
}
