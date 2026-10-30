import { useEffect, useState } from 'react';
import { textBoxOnPiece, checkTextSafety, findEdgeDetail, edgeInk } from '@engine';
import { drawPiece } from './drawPiece.js';

const CHECK_PX = 1000; // longest side of the finished piece when checking

/**
 * Safe zone check for each side (front, back). Runs shortly after the size changes.
 * Returns null while checking, then [{ text: [...], regions: [...], busy, ink }].
 * ink.touches = the design's colour reaches its edge (used by "Make bleed: Auto").
 */
export function useSafeZone(pdf, plan, renders) {
  const [result, setResult] = useState(null);
  const ready = renders.length >= plan.sides.length;
  const key = JSON.stringify([plan.out, plan.mode, plan.settings.safe, plan.sides.map((s) => s.index), ready]);

  useEffect(() => {
    let alive = true;
    if (!ready) {
      setResult(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const out = [];
        for (let i = 0; i < plan.sides.length; i++) {
          const page = plan.sides[i];
          const fit = plan.fits[i];
          const safeMm = plan.settings.safe;

          // 1. Real text in the PDF (exact).
          const items = await pdf.text(page.index);
          const boxes = items.map((it) => textBoxOnPiece(it, page, fit));
          const text = checkTextSafety(boxes, { outW: fit.outW, outH: fit.outH, safeMm });

          // 2. Sharp detail near the edges in the finished picture (smart guess).
          const k = Math.min(12, CHECK_PX / Math.max(fit.outW, fit.outH));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(fit.outW * k));
          canvas.height = Math.max(1, Math.round(fit.outH * k));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          drawPiece(ctx, renders[i], fit, page, 0, 0, k);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const detail = findEdgeDetail({
            data: img.data,
            width: canvas.width,
            height: canvas.height,
            pxPerMm: canvas.width / fit.outW,
            safeMm,
            skipX: fit.padW > 0.5, // white strips from "Fit" are not detail
            skipY: fit.padH > 0.5,
          });
          const ink = edgeInk({
            data: img.data,
            width: canvas.width,
            height: canvas.height,
            pxPerMm: canvas.width / fit.outW,
            skipX: fit.padW > 0.5,
            skipY: fit.padH > 0.5,
          });
          out.push({ text, regions: detail.regions, busy: detail.busy, ink });
        }
        if (alive) setResult(out);
      } catch {
        if (alive) setResult(null);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, key, renders]);

  return result;
}
