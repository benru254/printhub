// CUT & STACK ORDER
// Pieces are placed so that after printing, cutting the whole pile and putting
// the stacks on top of each other, everything is in order.
//
// With k spots per sheet and S sheets, spot j on sheet s holds item  j*S + s.
// So stack 1 (spot 1) holds items 1..S, stack 2 holds S+1..2S, and so on.
// Empty spots can only happen at the end of the last stack(s).

export function sheetsNeeded(total, perSheet) {
  if (!perSheet || total <= 0) return 0;
  return Math.ceil(total / perSheet);
}

// Item index (0-based) at spot `slot` of sheet `sheet`, or null when the spot is empty.
export function itemAt(sheet, slot, sheets, total) {
  const i = slot * sheets + sheet;
  return i < total ? i : null;
}

// One entry per spot: which items (0-based, inclusive) its stack holds.
export function stackRanges(total, perSheet) {
  const sheets = sheetsNeeded(total, perSheet);
  const list = [];
  for (let slot = 0; slot < perSheet; slot++) {
    const first = slot * sheets;
    const last = Math.min(total, (slot + 1) * sheets) - 1;
    list.push(first < total ? { slot, first, last, count: last - first + 1 } : { slot, first: null, last: null, count: 0 });
  }
  return list;
}
