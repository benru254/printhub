import { fillBleed } from '@engine';
import { drawPiece } from './drawPiece.js';

const PRINT_PX_PER_MM = 300 / 25.4; // 300 dpi
const PRINT_MAX_PX = 4000;
const PREVIEW_MAX_PX = 1200;

/**
 * One finished piece plus `ebMm` of made bleed on every side, as a canvas.
 * k = pixels per mm.
 */
export function makeBleedCanvas(render, fit, page, ebMm, k, method) {
  const pad = Math.max(1, Math.round(ebMm * k));
  const pw = Math.round(fit.outW * k);
  const ph = Math.round(fit.outH * k);
  const canvas = document.createElement('canvas');
  canvas.width = pw + 2 * pad;
  canvas.height = ph + 2 * pad;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  drawPiece(ctx, render, fit, page, pad, pad, pw / fit.outW);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  fillBleed(img.data, canvas.width, canvas.height, pad, method);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Small versions for the live sheet preview (one per side).
export function previewBleedCanvases(plan, renders) {
  const eb = plan.layout.effBleed;
  if (!plan.madeBleed || eb <= 0 || renders.length < plan.sides.length) return null;
  const k = Math.min(6, PREVIEW_MAX_PX / Math.max(plan.out.w + 2 * eb, plan.out.h + 2 * eb));
  return plan.sides.map((page, i) => makeBleedCanvas(renders[i], plan.fits[i], page, eb, k, plan.madeBleed));
}

/**
 * Print-quality bleed pictures for the PDF: [{ bytes, format }] per side.
 * The page is drawn again at about 300 dpi so the bleed is sharp enough.
 */
export async function printBleedArt(pdf, plan) {
  const eb = plan.layout.effBleed;
  if (!plan.madeBleed || eb <= 0) return null;
  const longest = Math.max(plan.out.w + 2 * eb, plan.out.h + 2 * eb);
  const k = Math.min(PRINT_PX_PER_MM, PRINT_MAX_PX / longest);
  const result = [];
  for (let i = 0; i < plan.sides.length; i++) {
    const page = plan.sides[i];
    const fit = plan.fits[i];
    const pageLongMm = Math.max(page.trimMm.w + 2 * page.bleedMm, page.trimMm.h + 2 * page.bleedMm);
    // Enough page pixels for k pixels per mm on the finished piece.
    const px = Math.min(PRINT_MAX_PX, Math.ceil(pageLongMm * k * Math.max(fit.sx, fit.sy)));
    const render = await pdf.render(page.index, px);
    const canvas = makeBleedCanvas(render, fit, page, eb, k, plan.madeBleed);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    result.push({ bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpg' });
  }
  return result;
}
