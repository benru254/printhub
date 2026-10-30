// Shapes of finished pieces: rectangle, rounded corners, circle / oval.
// An outline is a list of path steps in mm, origin = TOP-LEFT of the finished piece:
//   { op: 'M', x, y }  move   { op: 'L', x, y }  line
//   { op: 'C', x1, y1, x2, y2, x, y }  curve      { op: 'Z' }  close
// The same outline is used for the preview, the PDF cut line and the SVG cut file.

export const SHAPES = ['rect', 'rounded', 'ellipse', 'contour'];

const KAPPA = 0.5522847498; // how far curve handles go to draw a quarter circle

// Largest corner radius that fits the piece.
export function clampRadius(radius, w, h) {
  return Math.max(0, Math.min(Number(radius) || 0, w / 2, h / 2));
}

export function shapeOutline({ shape = 'rect', w, h, radius = 0 }) {
  if (shape === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const kx = rx * KAPPA;
    const ky = ry * KAPPA;
    return [
      { op: 'M', x: w, y: ry },
      { op: 'C', x1: w, y1: ry + ky, x2: rx + kx, y2: h, x: rx, y: h },
      { op: 'C', x1: rx - kx, y1: h, x2: 0, y2: ry + ky, x: 0, y: ry },
      { op: 'C', x1: 0, y1: ry - ky, x2: rx - kx, y2: 0, x: rx, y: 0 },
      { op: 'C', x1: rx + kx, y1: 0, x2: w, y2: ry - ky, x: w, y: ry },
      { op: 'Z' },
    ];
  }
  const r = shape === 'rounded' ? clampRadius(radius, w, h) : 0;
  if (r <= 0.01) {
    return [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: w, y: 0 }, { op: 'L', x: w, y: h }, { op: 'L', x: 0, y: h }, { op: 'Z' }];
  }
  const k = r * KAPPA;
  return [
    { op: 'M', x: r, y: 0 },
    { op: 'L', x: w - r, y: 0 },
    { op: 'C', x1: w - r + k, y1: 0, x2: w, y2: r - k, x: w, y: r },
    { op: 'L', x: w, y: h - r },
    { op: 'C', x1: w, y1: h - r + k, x2: w - r + k, y2: h, x: w - r, y: h },
    { op: 'L', x: r, y: h },
    { op: 'C', x1: r - k, y1: h, x2: 0, y2: h - r + k, x: 0, y: h - r },
    { op: 'L', x: 0, y: r },
    { op: 'C', x1: 0, y1: r - k, x2: r - k, y2: 0, x: r, y: 0 },
    { op: 'Z' },
  ];
}

/**
 * The cut outline of one finished piece for any shape, including 'contour'
 * (shape.outlines = cut lines that follow the design, already in mm).
 * Several outlines are joined into one path (each starts with its own 'M').
 */
export function pieceOutline(shape, w, h) {
  if (shape && shape.shape === 'contour') {
    return shape.outlines && shape.outlines.length ? shape.outlines.flat() : shapeOutline({ shape: 'rect', w, h });
  }
  return shapeOutline({ shape: (shape && shape.shape) || 'rect', w, h, radius: shape ? shape.radius : 0 });
}

// Moves every point of an outline with fn(x, y) -> [x, y].
export function mapOutline(outline, fn) {
  return outline.map((s) => {
    if (s.op === 'Z') return s;
    const [x, y] = fn(s.x, s.y);
    if (s.op !== 'C') return { op: s.op, x, y };
    const [x1, y1] = fn(s.x1, s.y1);
    const [x2, y2] = fn(s.x2, s.y2);
    return { op: 'C', x1, y1, x2, y2, x, y };
  });
}

// SVG path text, e.g. "M 0 0 L 85 0 ... Z"
export function outlineToSvg(outline) {
  const n = (v) => (Math.round(v * 1000) / 1000).toString();
  return outline
    .map((s) => {
      if (s.op === 'Z') return 'Z';
      if (s.op === 'C') return `C ${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}`;
      return `${s.op} ${n(s.x)} ${n(s.y)}`;
    })
    .join(' ');
}

// Draws the outline as a path on a canvas (fn maps mm to canvas pixels).
export function outlineToCanvas(ctx, outline, fn = (x, y) => [x, y]) {
  ctx.beginPath();
  for (const s of outline) {
    if (s.op === 'Z') {
      ctx.closePath();
      continue;
    }
    const [x, y] = fn(s.x, s.y);
    if (s.op === 'M') ctx.moveTo(x, y);
    else if (s.op === 'L') ctx.lineTo(x, y);
    else {
      const [x1, y1] = fn(s.x1, s.y1);
      const [x2, y2] = fn(s.x2, s.y2);
      ctx.bezierCurveTo(x1, y1, x2, y2, x, y);
    }
  }
}
