// Tutor-style notes for booklets.

import { fmtMm, fmtSize } from '../../core/units.js';
import { minMargin, flipEdgeName } from '../../core/printers.js';
import { MAX_STAPLED_PAGES } from './plan.js';

const ORDER = { risk: 0, caution: 1, info: 2 };

export function getBookletWarnings({ plan }) {
  const list = [];
  const add = (id, level, title, text, learn = false) => list.push({ id, level, title, text, learn });
  const { layout, sheet, printer, settings } = plan;

  if (!layout.count) {
    add('too-big', 'risk', "The booklet doesn't fit",
      `An open booklet is ${fmtSize(plan.page.w * 2, plan.page.h)}. That is bigger than what ${printer.name} can print on ${sheet.label}. Choose a bigger sheet.`);
  }

  if (plan.scale < 0.999 && layout.count) {
    add('shrunk', 'caution', `Shrunk to ${Math.round(plan.scale * 100)}% to fit`,
      `An open booklet (${fmtSize(plan.page.w * 2, plan.page.h)}) is bigger than what ${printer.name} can print on ${sheet.label}, so it is printed at ${fmtSize(plan.out.w, plan.out.h)} per page.${plan.best ? ` For full size use ${plan.best.id}${plan.best.orientation === 'landscape' ? ' landscape' : ''}.` : ''}${settings.marks || settings.bleedUsed > 0 ? ' If the booklet will not be trimmed, turning off cut marks and bleed lets it print bigger.' : ''}`);
  }

  if (plan.pad > 0) {
    add('blank-pages', 'info', `${plan.pad} blank ${plan.pad === 1 ? 'page' : 'pages'} added`,
      `A folded booklet needs a multiple of 4 pages. Your file has ${plan.geometry.pageCount}, so ${plan.pad} blank ${plan.pad === 1 ? 'page is' : 'pages are'} added ${plan.blanks === 'end' ? 'at the very end' : 'just before the back cover, so your last page stays the back cover'}.`);
  }

  if (plan.pages > MAX_STAPLED_PAGES) {
    add('too-thick', 'caution', 'Thick for a stapled booklet',
      `${plan.pages} pages is a lot to fold and staple. Over about ${MAX_STAPLED_PAGES} pages (80 gsm), a glued spine (perfect binding) works better.`);
  }

  if (plan.creepTotal > 0) {
    add('creep', 'info', `Creep fixed: ${fmtMm(plan.creepTotal)} mm`,
      `When sheets are folded inside each other, the inner ones stick out at the edge and get more cut off. Pages on inner sheets are moved up to ${fmtMm(plan.creepTotal)} mm toward the fold to fix it (${plan.paper.label}).`, true);
  }

  if (plan.mixedSizes) {
    add('mixed-sizes', 'caution', 'Pages have different sizes',
      `The booklet uses page 1's size (${fmtSize(plan.page.w, plan.page.h)}). Pages of other sizes are resized to that size, which may stretch them.`);
  }

  if (settings.bleedUsed === 0) {
    add('no-bleed', 'info', 'No bleed',
      'Without bleed, colour that touches the page edge can show a thin white line after trimming. Add bleed in the design program if you can.', true);
  }

  if (!printer.measured) {
    add('margin-guess', 'info', 'Printer margins are a guess',
      `We assume ${printer.name} can't print the outer ${fmtMm(minMargin(settings.printerMargins))} mm of the paper. Print the margin test sheet (Printers → Edit) for exact layouts.`, true);
  }

  const edge = flipEdgeName(plan.flip, sheet.orientation);
  if (printer.duplex) {
    add('booklet-print', 'info', 'How to print',
      `Print all ${plan.pdfPages} pages double-sided, "Flip on ${edge}". Print ${plan.sets} ${plan.sets === 1 ? 'copy' : 'copies'} with "Collate" on. Each set of ${plan.sheetCount} ${plan.sheetCount === 1 ? 'sheet' : 'sheets'} makes ${plan.perSheet} ${plan.perSheet === 1 ? 'booklet' : 'booklets'}: keep the sheets in order, fold them in the middle together, and staple on the fold.`, true);
  } else {
    add('no-duplex', 'caution', 'Your printer prints one side at a time',
      `Print the odd PDF pages (fronts) first. Put the stack back in, turned ${plan.flip === 'calendar' ? 'like a calendar' : 'like a book page'}, then print the even pages (backs). Test with one sheet first.`);
  }

  return list.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
