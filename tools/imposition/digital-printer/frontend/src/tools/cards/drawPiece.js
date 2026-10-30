import { pieceDrawing } from '@engine';

// Draws ONE finished piece (cut exactly at its finished size, no bleed) at (x, y),
// k = pixels per mm. Used by the Finished preview and by the safe zone check,
// so both look at exactly the same picture.
export function drawPiece(ctx, render, fit, page, x, y, k) {
  const pw = fit.outW * k;
  const ph = fit.outH * k;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, pw, ph);
  if (!render) return;
  const d = pieceDrawing(fit, 0, page);
  const src = render.rectToPx(d.srcBoxPt);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, pw, ph);
  ctx.clip();
  const cx = x + pw / 2;
  const cy = y + ph / 2;
  ctx.drawImage(render.canvas, src.x, src.y, src.w, src.h, cx - d.halfW * k, cy - d.halfH * k, 2 * d.halfW * k, 2 * d.halfH * k);
  ctx.restore();
}
