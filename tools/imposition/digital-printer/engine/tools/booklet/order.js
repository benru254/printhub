// SADDLE-STITCH BOOKLET ORDER
// Sheets are printed both sides, stacked, folded in the middle and stapled.
// The page count must be a multiple of 4 (each sheet = 4 pages).
//
// For N pages (1-based), sheet i (0 = outside sheet) holds:
//   front: [N - 2i, 2i + 1]      back: [2i + 2, N - 2i - 1]   (left, right)
// e.g. 8 pages: sheet 1 front 8|1, back 2|7; sheet 2 front 6|3, back 4|5.

/**
 * Booklet pages in reading order, padded to a multiple of 4.
 * Each entry is a source page index (0-based) or null for a blank page.
 * blanks: 'before-back' keeps the last page as the back cover; 'end' adds blanks at the very end.
 */
export function bookletPages(pageCount, blanks = 'before-back') {
  const n = Math.max(4, Math.ceil(pageCount / 4) * 4);
  const pad = n - pageCount;
  const pages = [];
  if (pad === 0 || blanks === 'end' || pageCount < 2) {
    for (let i = 0; i < pageCount; i++) pages.push(i);
    for (let i = 0; i < pad; i++) pages.push(null);
  } else {
    for (let i = 0; i < pageCount - 1; i++) pages.push(i);
    for (let i = 0; i < pad; i++) pages.push(null);
    pages.push(pageCount - 1);
  }
  return pages;
}

// Positions (0-based, in booklet reading order) on each sheet.
export function saddleSheets(n) {
  const sheets = [];
  for (let i = 0; i < n / 4; i++) {
    sheets.push({
      front: [n - 1 - 2 * i, 2 * i],
      back: [2 * i + 1, n - 2 - 2 * i],
    });
  }
  return sheets;
}

// Reader view: spreads as the reader sees them. [[null, 0], [1, 2], ..., [n-1, null]]
export function readerSpreads(n) {
  const spreads = [[null, 0]];
  for (let i = 1; i < n - 1; i += 2) spreads.push([i, i + 1]);
  spreads.push([n - 1, null]);
  return spreads;
}
