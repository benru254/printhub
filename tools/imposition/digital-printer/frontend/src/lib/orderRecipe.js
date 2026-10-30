// A "recipe" is the settings a customer chose in a tool, saved with their order.
// When the operator opens the order, the tool starts from the recipe instead of the defaults.
//   recipe = { v: 1, tool, printer: { id, name }, base, overrides, extra }

// start = the tool's normal start state { base, overrides }
export function orderStart(initial, start) {
  if (!initial) return start;
  return {
    base: { ...start.base, ...(initial.base || {}) },
    overrides: initial.overrides || start.overrides,
  };
}

// extra settings of a tool (numbering, booklet, book...): recipe value on top of the normal value
export function orderExtra(initial, key, normal) {
  const v = initial && initial.extra ? initial.extra[key] : undefined;
  if (v === undefined) return normal;
  return v && typeof v === 'object' && !Array.isArray(v) && normal && typeof normal === 'object' ? { ...normal, ...v } : v;
}
