import { NUMBER_COLORS, NUMBER_FONTS } from '@engine';

// Draws a number centred at (x, y) on a canvas. k = pixels per mm.
export function drawNumber(ctx, text, x, y, k, numbering) {
  const font = NUMBER_FONTS[numbering.font] || NUMBER_FONTS.bold;
  const px = ((numbering.size * 25.4) / 72) * k;
  ctx.font = font.css.replace('{size}', String(px));
  ctx.fillStyle = (NUMBER_COLORS[numbering.color] || NUMBER_COLORS.red).css;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + px * 0.04);
}
