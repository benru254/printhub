// Tutor-style notes for Cut & Stack. Built on the Cards notes, plus numbering and stacking tips.

import { getCardWarnings } from '../cards/warnings.js';
import { fmtMm } from '../../core/units.js';
import { PART_NAMES } from './numbering.js';

const ORDER = { risk: 0, caution: 1, info: 2 };

export function getCutStackWarnings({ plan, imageInfo, safety }) {
  const geometry = plan.stackMode === 'pages' ? { ...plan.sourceGeometry, pageCount: 1 } : plan.sourceGeometry;
  const list = getCardWarnings({ plan, geometry, imageInfo, safety }).filter((n) => n.id !== 'extra-pages');
  const add = (id, level, title, text, learn = false) => list.push({ id, level, title, text, learn });
  const { numbering, out, settings } = plan;

  if (plan.emptySpots > 0 && plan.perSheet > 0) {
    const fill = plan.sheets * plan.perSheet;
    add('empty-spots', 'info', `${plan.emptySpots} empty ${plan.emptySpots === 1 ? 'spot' : 'spots'} on the last sheets`,
      plan.stackMode === 'pages'
        ? 'Some spots on the last sheets are left empty, so the order stays right after cutting.'
        : `You can print ${fill} instead of ${plan.total} on the same ${plan.sheets} sheets. Change "How many" to ${fill} to use them.`);
  }

  if (plan.books && !plan.books.whole) {
    const left = plan.total % plan.books.perBook;
    add('books-split', 'caution', 'The last book is not full',
      `${plan.total} is not a whole number of books of ${plan.books.perBook}: the last book will have only ${left}. Change "How many" to ${plan.books.count * plan.books.perBook} for ${plan.books.count} full books.`);
  }

  if (plan.stackMode === 'number') {
    const inset = settings.safe;
    const tooClose = numbering.positions.some((p) =>
      p.x - numbering.box.w / 2 < inset - 0.05 ||
      p.y - numbering.box.h / 2 < inset - 0.05 ||
      out.w - (p.x + numbering.box.w / 2) < inset - 0.05 ||
      out.h - (p.y + numbering.box.h / 2) < inset - 0.05);
    if (tooClose) {
      add('number-edge', 'caution', 'The number is close to the edge',
        `Keep the number at least ${fmtMm(inset)} mm inside the cut, or it may be cut off. Drag it inwards in "Number & place".`);
    }
  }

  if (plan.parts > 1) {
    const names = PART_NAMES.slice(0, plan.parts).join(', ');
    add('parts', 'info', `${plan.parts} copies of every number`,
      plan.printOrder === 'sets'
        ? `Each sheet is printed ${plan.parts} times in a row (${names}). Use pre-collated NCR paper, or ${plan.parts} paper trays, so the sets come out in order.`
        : `All "${PART_NAMES[0]}" sheets come first, then all "${PART_NAMES[1]}"${plan.parts > 2 ? `, then "${PART_NAMES[2]}"` : ''}. Load the right paper before each part.`);
  }

  if (plan.stackMode === 'pages' && plan.needsBleed) {
    add('pages-no-made-bleed', 'info', 'Make bleed is not used here',
      'Make bleed works on one design. For a file of many different pages, add bleed in the design program.', true);
  }

  return list.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
