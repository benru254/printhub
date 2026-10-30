// Tutor-style notes for perfect-bound (glued) books.

import { fmtMm, fmtSize } from '../../core/units.js';
import { minMargin, flipEdgeName } from '../../core/printers.js';
import { MIN_SPINE_MM } from './plan.js';

const ORDER = { risk: 0, caution: 1, info: 2 };

export function getPerfectBoundWarnings({ plan }) {
  const list = [];
  const add = (id, level, title, text, learn = false) => list.push({ id, level, title, text, learn });
  const { layout, sheet, printer, settings, cover } = plan;

  if (!layout.count) {
    add('too-big', 'risk', "The pages don't fit",
      `An open signature is ${fmtSize(plan.page.w * 2, plan.page.h)}. That is bigger than what ${printer.name} can print on ${sheet.label}. Choose a bigger sheet.`);
  }
  if (plan.scale < 0.999 && layout.count) {
    add('shrunk', 'caution', `Shrunk to ${Math.round(plan.scale * 100)}% to fit`,
      `Open pages are bigger than what ${printer.name} can print on ${sheet.label}, so pages are printed at ${fmtSize(plan.out.w, plan.out.h)}.${plan.best ? ` For full size use ${plan.best.id}${plan.best.orientation === 'landscape' ? ' landscape' : ''}.` : ''}`);
  }

  if (cover.enabled && !cover.layout) {
    add('cover-too-big', 'risk', "The cover doesn't fit",
      `The open cover is ${fmtSize(cover.w, cover.h)} (back + ${fmtMm(cover.spine)} mm spine + front). None of ${printer.name}'s sheets is big enough. Add a bigger sheet under Printers.`);
  }
  if (plan.spine < MIN_SPINE_MM) {
    add('thin-spine', 'caution', `Spine is only ${fmtMm(plan.spine)} mm`,
      `Glue holds badly on spines thinner than about ${MIN_SPINE_MM} mm (${plan.insidePages} pages). A stapled booklet is better for thin books.`);
  }
  if (!cover.enabled) {
    add('no-cover', 'info', 'No cover from the file',
      'All pages are printed as inside pages. Make the cover separately (back + spine + front), or turn on "First and last page are the cover".', true);
  }

  if (plan.pad > 0) {
    add('blank-pages', 'info', `${plan.pad} blank ${plan.pad === 1 ? 'page' : 'pages'} added at the end`,
      `Signatures need a multiple of 4 inside pages. You have ${plan.insidePages}, so ${plan.pad} blank ${plan.pad === 1 ? 'page is' : 'pages are'} added after the last inside page.`);
  }

  add('signatures', 'info', `${plan.signatures.length} ${plan.signatures.length === 1 ? 'signature' : 'signatures'} of ${plan.signature} pages`,
    `Fold each signature's sheets together (like a small booklet), stack the signatures in order (signature 1 on top), then glue the spine. The sheet number and signature are printed in small grey text under each sheet.`, true);

  if (plan.grind > 0) {
    add('grind', 'info', `${fmtMm(plan.grind)} mm spine milling space added`,
      'Each page is moved away from the fold so the binder can mill the spine edge before gluing. Keep text at least 8 mm from the spine.', true);
  }
  if (plan.creepTotal > 0) {
    add('creep', 'info', `Creep fixed: ${fmtMm(plan.creepTotal)} mm`,
      'Inner sheets of each signature are moved toward the fold so nothing gets cut off at the edge.', true);
  }
  if (plan.mixedSizes) {
    add('mixed-sizes', 'caution', 'Pages have different sizes',
      `The book uses page 1's size (${fmtSize(plan.page.w, plan.page.h)}). Pages of other sizes are resized to that size, which may stretch them.`);
  }
  if (settings.bleedUsed === 0) {
    add('no-bleed', 'info', 'No bleed',
      'Without bleed, colour that touches the page edge can show a thin white line after trimming.', true);
  }
  if (!printer.measured) {
    add('margin-guess', 'info', 'Printer margins are a guess',
      `We assume ${printer.name} can't print the outer ${fmtMm(minMargin(settings.printerMargins))} mm of the paper. Print the margin test sheet (Printers → Edit) for exact layouts.`, true);
  }

  const edge = flipEdgeName(plan.flip, sheet.orientation);
  add('book-print', 'info', 'How to print',
    `Inside pages: print all ${plan.pdfPages} pages double-sided ("Flip on ${edge}"), ${plan.sets} ${plan.sets === 1 ? 'copy' : 'copies'} collated.${cover.enabled && cover.layout ? ` Cover: print the cover PDF ${plan.coverSets} ${plan.coverSets === 1 ? 'time' : 'times'} on ${cover.paper.label} ${cover.sheet.label} (one side).` : ''}`, true);

  return list.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
