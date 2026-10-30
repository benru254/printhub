// Perfect-bound books (glued spine): signatures for the inside pages and a wrap-around cover.
// The inside pages PDF is built with the booklet builder (same plan shape).
export * from './plan.js';
export * from './warnings.js';
export * from './buildCover.js';
export { buildBookletPdf as buildBookInsidePdf } from '../booklet/buildPdf.js';
