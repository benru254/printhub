// PRESS MARKS for offset printing: a colour bar and registration marks in a strip along
// the top of the sheet (the edge opposite the gripper). The press operator uses the colour
// bar to keep the ink even and the registration marks to line up the four plates.
// Pure geometry in mm (top-left origin). Drawn by pdfPieces.js and by the screen preview.

export const PRESS_STRIP = 8; // mm kept free at the top of the sheet for the marks
const PATCH = 5; // mm, one colour patch
const TARGET = 2.2; // mm, radius of a registration mark

// c, m, y, k from 0 to 1. Solids, two-colour overprints and a 50% grey.
const PATCHES = [
  [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1],
  [1, 1, 0, 0], [0, 1, 1, 0], [1, 0, 1, 0], [0, 0, 0, 0.5],
];

/**
 * layout: from computeStepRepeat (needs sheetW and margins).  printerTop: the printer's own top margin.
 * Returns { bar: [{ x, y, w, h, cmyk }], targets: [{ x, y, r }], text: { x, y } } or null when there is no room.
 */
export function pressMarks(layout, printerTop = 0) {
  const { sheetW, margins } = layout;
  const left = margins.left + 1;
  const right = sheetW - margins.right - 1;
  const y = printerTop + (PRESS_STRIP - PATCH) / 2;
  const width = right - left;
  if (width < 60) return null;
  const cyTarget = y + PATCH / 2;
  const targets = [
    { x: left + TARGET, y: cyTarget, r: TARGET },
    { x: sheetW / 2, y: cyTarget, r: TARGET },
    { x: right - TARGET, y: cyTarget, r: TARGET },
  ];
  // Patches fill the two stretches between the three registration marks.
  const bar = [];
  const runs = [
    [left + 2 * TARGET + 2, sheetW / 2 - TARGET - 2],
    [sheetW / 2 + TARGET + 2, right - 2 * TARGET - 2],
  ];
  let k = 0;
  for (const [from, to] of runs) {
    const n = Math.floor((to - from) / PATCH);
    const start = from + (to - from - n * PATCH) / 2;
    for (let i = 0; i < n; i++) bar.push({ x: start + i * PATCH, y, w: PATCH, h: PATCH, cmyk: PATCHES[k++ % PATCHES.length] });
  }
  return { bar, targets };
}
