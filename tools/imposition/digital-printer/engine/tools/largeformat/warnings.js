// Tutor-style notes for large format. They explain WHY something matters and never block.
// level: 'risk' | 'caution' | 'info'   learn: a general tip ("Got it" hides it for good)

import { fmtMm } from '../../core/units.js';
import { sizeText } from '../../core/catalogue.js';

export function getLargeFormatWarnings({ plan }) {
  const list = [];
  const add = (id, level, title, text, learn = false) => list.push({ id, level, title, text, learn });
  const { fit, finished, panels, cols, rows, overlap, media } = plan;

  if (!plan.fits) {
    add('lf-no-fit', 'risk', "It doesn't fit", media === 'sheet'
      ? 'This print needs too many sheets. Choose a bigger sheet or a smaller finished size.'
      : 'The roll is too narrow for this print, even in parts. Check the roll width.');
    return list;
  }
  if (plan.quality && plan.quality.level === 'poor') {
    add('lf-low-res', 'risk', `Picture quality is low (${plan.dpi} dpi)`,
      `At ${sizeText(finished.w, finished.h)} this picture has only ${plan.dpi} dots per inch. It will look blurry. Ask for the original design file, or a bigger picture.`);
  } else if (plan.quality && plan.quality.level === 'ok') {
    add('lf-soft-res', 'caution', `Picture is a little soft (${plan.dpi} dpi)`,
      'It looks fine from a few steps away. Up close it will be soft. A bigger original picture would be sharper.');
  }
  if (fit.mode === 'fill' && (fit.cropW > 1 || fit.cropH > 1)) {
    const where = fit.cropW > 1 ? `${fmtMm(fit.cropW / 2)} mm off the left and the right` : `${fmtMm(fit.cropH / 2)} mm off the top and the bottom`;
    add('lf-cropped', 'caution', 'The design has a different shape',
      `To fill ${sizeText(finished.w, finished.h)} the design is cut ${where}. Check nothing important is lost, or choose Fit to show all of it with white space.`);
  }
  if (fit.mode === 'stretch' && fit.distortion > 0.02) {
    add('lf-stretched', 'caution', 'The design is stretched', `It is pulled ${Math.round(fit.distortion * 100)}% out of shape to fill the size. Faces and logos will look wrong.`);
  }
  if (panels.length > 1 && media === 'roll') {
    add('lf-panels', 'info', `Printed in ${panels.length} parts`,
      `The print is wider than the roll, so it is made in ${panels.length} parts that overlap ${fmtMm(overlap)} mm. Join them on the join lines (weld or tape).`, true);
  }
  if (panels.length > 1 && media === 'sheet') {
    add('lf-tiles', 'info', `${panels.length} sheets (${cols} across, ${rows} down)`,
      `Trim one edge of each sheet at the join line and stick it over its neighbour: they overlap ${fmtMm(overlap)} mm.`, true);
  }
  if (plan.scale !== 1) {
    add('lf-scale', 'caution', 'The file is made at 10% size',
      'This print is longer than 5 metres, which most programs cannot open. The file is made at one tenth of the size: print it at 1000%. It says so on every part.');
  }
  if (plan.fill === 'mirror') {
    add('lf-mirror', 'info', 'Edges are mirrored into the hem',
      'The design has no extra around it, so its edges are mirrored into the hem and trim area. Nothing inside the finished size changes.', true);
  }
  return list;
}
