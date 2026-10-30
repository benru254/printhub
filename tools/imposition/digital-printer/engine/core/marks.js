// Crop (cut) marks for a grid layout.
// Lines sit OUTSIDE the grid, lined up with every cut, so the cutter can see where to cut.
// Returns line segments in mm, top-left origin: { x1, y1, x2, y2 }.

export function cropMarks(layout) {
  if (!layout.marks || !layout.grid) return [];
  const { grid, slots, markOffset: off, markLength: len } = layout;

  const xs = uniqueSorted(slots.flatMap((s) => [s.x, s.x + s.w]));
  const ys = uniqueSorted(slots.flatMap((s) => [s.y, s.y + s.h]));

  const top = grid.y;
  const bottom = grid.y + grid.h;
  const left = grid.x;
  const right = grid.x + grid.w;

  const lines = [];
  for (const x of xs) {
    lines.push({ x1: x, y1: top - off - len, x2: x, y2: top - off });
    lines.push({ x1: x, y1: bottom + off, x2: x, y2: bottom + off + len });
  }
  for (const y of ys) {
    lines.push({ x1: left - off - len, y1: y, x2: left - off, y2: y });
    lines.push({ x1: right + off, y1: y, x2: right + off + len, y2: y });
  }
  return lines;
}

function uniqueSorted(values) {
  const seen = new Map();
  for (const v of values) seen.set(Math.round(v * 100) / 100, v);
  return [...seen.values()].sort((a, b) => a - b);
}
