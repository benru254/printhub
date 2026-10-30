import { useEffect, useState } from 'react';
import { contourFromPixels } from '@engine';
import { drawPiece } from './drawPiece.js';

const MAX_PX = 1400; // longest side of the finished piece while finding the outline

/**
 * Finds the cut line around the design (front side) for shape 'contour'.
 * Returns null while working (or when not needed), then { outlines, coverage, pieces }.
 */
export function useContour(pdf, plan, { enabled, offset, ignoreWhite }) {
  const [result, setResult] = useState(null);
  const page = plan.sides[0];
  const fit = plan.fits[0];
  const key = JSON.stringify([enabled, offset, ignoreWhite, plan.out, plan.mode, page.index]);

  useEffect(() => {
    let alive = true;
    setResult(null);
    if (!enabled) return undefined;
    const timer = setTimeout(async () => {
      try {
        const k = Math.min(12, MAX_PX / Math.max(plan.out.w, plan.out.h));
        const pageLong = Math.max(page.trimMm.w + 2 * page.bleedMm, page.trimMm.h + 2 * page.bleedMm);
        const render = await pdf.render(page.index, Math.min(2400, Math.ceil(pageLong * k * Math.max(fit.sx, fit.sy))), { transparent: true });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(plan.out.w * k));
        canvas.height = Math.max(1, Math.round(plan.out.h * k));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        drawPiece(ctx, render, fit, page, 0, 0, canvas.width / plan.out.w, null);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = contourFromPixels({
          data: img.data,
          width: canvas.width,
          height: canvas.height,
          pxPerMm: canvas.width / plan.out.w,
          offsetMm: offset,
          ignoreWhite,
        });
        if (alive) setResult(found);
      } catch {
        if (alive) setResult({ outlines: [], coverage: 0, pieces: 0 });
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, key]);

  return result;
}
