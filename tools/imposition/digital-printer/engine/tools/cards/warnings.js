// Tutor-style notes for the Cards tool. They explain WHY something matters and never block the user.
// level: 'risk' (likely wasted paper) | 'caution' (worth knowing) | 'info' (tip)

import { fmtMm, fmtSize } from '../../core/units.js';
import { minMargin, flipEdgeName } from '../../core/printers.js';

const ORDER = { risk: 0, caution: 1, info: 2 };

// Print resolution (dpi) of a picture at the size it will be printed.
export function imageDpi(info, page, fit = { sx: 1, sy: 1 }) {
  if (!info) return null;
  const pageW = page.trimMm.w + 2 * page.bleedMm;
  const pageH = page.trimMm.h + 2 * page.bleedMm;
  return Math.round(Math.min((info.px.w * 25.4) / (pageW * fit.sx), (info.px.h * 25.4) / (pageH * fit.sy)));
}

export function qualityOf(dpi) {
  if (dpi == null) return null;
  if (dpi >= 220) return { level: 'good', label: 'Good quality' };
  if (dpi >= 150) return { level: 'ok', label: 'OK, may look slightly soft' };
  return { level: 'poor', label: 'Low quality, will look blurry' };
}

const joinEdges = (edges) => {
  const list = [...new Set(edges)];
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};

/**
 * safety (optional): result of the safe zone check, one entry per side:
 *   [{ text: [issues], regions: [...], busy }]
 */
export function getCardWarnings({ plan, geometry, imageInfo, safety }) {
  const { settings, layout, sheet, fits, out, sides, resized, printer, twoSided } = plan;
  const first = sides[0];
  const list = [];
  // learn: a general tip. "Got it" hides it for good. Other notes are about THIS file
  // and only hide for this job, so a problem in the next file is never missed.
  const add = (id, level, title, text, learn = false) => list.push({ id, level, title, text, learn });

  if (layout.count === 0) {
    add('too-big', 'risk', "It doesn't fit",
      `A ${fmtSize(out.w, out.h)} piece is bigger than the printable area of a ${sheet.label} sheet. Choose a bigger sheet, turn the sheet, or make the printer margin smaller.`);
  }

  // ----- Safe zone -----
  if (safety) {
    safety.forEach((s, i) => {
      if (!s) return;
      const where = twoSided ? ` on the ${i === 0 ? 'front' : 'back'}` : '';
      const cut = s.text.filter((t) => t.cut);
      const near = s.text.filter((t) => !t.cut);
      if (cut.length) {
        add(`text-cut-${i}`, 'risk', `Text will be cut off${where}`,
          `"${short(cut[0].str)}"${cut.length > 1 ? ` and ${cut.length - 1} more` : ''} goes past the cut line. Move it at least ${fmtMm(settings.safe)} mm inside the edge${resized ? ', or use Fit under Print size' : ''}. It's marked in red in Finished pieces.`);
      }
      if (near.length) {
        const n = near[0];
        add(`text-near-${i}`, 'caution', `Text too close to the edge${where}`,
          `"${short(n.str)}" is only ${fmtMm(Math.max(0, n.distance))} mm from the cut (${n.edge} edge)${near.length > 1 ? `, and ${near.length - 1} more` : ''}. Cutting can move 1–2 mm, so keep text at least ${fmtMm(settings.safe)} mm inside. It's marked in red in Finished pieces.`);
      }
      if (!s.text.length && s.regions.length) {
        add(`detail-near-${i}`, 'caution', `Something is close to the edge${where}`,
          `There is detail (text, a logo or a border) within ${fmtMm(settings.safe)} mm of the ${joinEdges(s.regions.map((r) => r.edge))} edge. It's marked in Finished pieces. Check it won't get cut or look uneven after cutting.`);
      }
      if (s.busy) {
        add(`busy-edges-${i}`, 'info', `Busy design near the edges${where}`,
          'Your design is busy near the edges (like a photo), so we could not check it automatically. Look at the dashed safe line in Finished pieces: keep text and logos inside it.');
      }
    });
  }

  // ----- Picture quality at the size it will be printed -----
  if (imageInfo) {
    const dpis = sides.map((p, i) => imageDpi(imageInfo[i], p, fits[i])).filter((d) => d != null);
    const worst = Math.min(...dpis);
    if (worst < 150) {
      add('low-res', 'risk', `Picture quality is low (${worst} dpi)`,
        `At this size the picture has only ${worst} dots per inch. Print needs about 300. Text and edges will look blurry. Ask for a bigger original picture or print it smaller.`);
    } else if (worst < 220) {
      add('soft-res', 'caution', `Picture quality is OK (${worst} dpi)`,
        `Print looks sharpest at about 300 dpi. At ${worst} dpi small text may look slightly soft.`);
    }
  }

  // ----- Printer -----
  const printerMin = minMargin(settings.printerMargins);
  if (settings.margin < printerMin - 0.05) {
    add('margin-smaller', 'risk', 'Margin is smaller than your printer allows',
      `${printer.name} cannot print within ${fmtMm(printerMin)} mm of the edge, but the margin is set to ${fmtMm(settings.margin)} mm. Marks or pieces near the edge may come out cut off.`);
  }
  if (!printer.measured) {
    add('margin-guess', 'info', 'Printer margins are a guess',
      `We assume ${printer.name} can't print the outer ${fmtMm(printerMin)} mm of the paper. Print the margin test sheet (Printers → Edit) and enter the real numbers for exact layouts.`, true);
  }

  if (!settings.marks) {
    add('marks-off', 'caution', 'Cut marks are off',
      'Cut marks show the person cutting exactly where each piece ends. Without them they have to guess, and pieces can come out uneven. Turn them off only if your printer or cutter adds its own.');
  }

  // ----- Resizing notes (front side is enough to explain) -----
  const f = fits[0];
  if (resized && f.mode === 'stretch' && f.distortion > 0.02) {
    add('stretched', 'caution', `Design is stretched ${Math.round(f.distortion * 100)}%`,
      'The design fills the new size exactly, but its shape changes. Logos, circles and faces will look squashed. Use Fill or Fit to keep the shape.');
  }
  if (resized && f.mode === 'fit' && (f.padW > 0.5 || f.padH > 0.5)) {
    const where = f.padW > 0.5 ? 'left and right' : 'top and bottom';
    const each = fmtMm((f.padW > 0.5 ? f.padW : f.padH) / 2);
    add('fit-white', 'caution', 'White strips added',
      `The whole design is visible, but there will be ${each} mm of white paper on the ${where}. Use Fill if the colour must reach the edges.`);
  }
  if (resized && f.mode === 'fill' && (f.cropW > 0.5 || f.cropH > 0.5)) {
    const where = f.cropW > 0.5 ? 'left and right' : 'top and bottom';
    const each = fmtMm((f.cropW > 0.5 ? f.cropW : f.cropH) / 2);
    add('fill-crop', 'info', 'Some of the edges are cut off',
      `To cover the new size without changing its shape, about ${each} mm of the design is cut off the ${where}. Check that no text or logo is lost. Use Fit to keep everything.`);
  }

  if (settings.bleed > settings.availBleed + 0.05) {
    add('bleed-short', 'caution', `Only ${fmtMm(settings.availBleed)} mm bleed is possible`,
      `You asked for ${fmtMm(settings.bleed)} mm bleed, but at this size the design only has ${fmtMm(settings.availBleed)} mm of extra picture around the edge. We used ${fmtMm(settings.bleedUsed)} mm.`);
  }

  if (!resized && first.source === 'guess' && settings.bleedUsed > 0) {
    add('bleed-guessed', 'info', `We found ${fmtMm(first.bleedMm)} mm bleed`,
      `Your file is a little bigger than a standard ${fmtSize(first.trimMm.w, first.trimMm.h)} piece, so we treated the extra ${fmtMm(first.bleedMm)} mm on each side as bleed (extra colour that gets cut off). If that's wrong, change Bleed under Advanced.`, true);
  }

  if (imageInfo && !resized) {
    const i0 = imageInfo[0];
    if (i0.sizeSource === 'default') {
      add('image-size', 'info', 'We guessed the print size',
        `Pictures don't store a print size, so we used ${fmtSize(first.trimMm.w, first.trimMm.h)} (300 dpi). If you need a set size, change it under Print size.`, true);
    } else if (i0.sizeSource === 'standard') {
      add('image-size', 'info', `Set to ${i0.sizeName}`,
        `Your picture has the exact shape of a ${i0.sizeName}, so we used that size. You can change it under Print size.`, true);
    }
  }

  if (plan.madeBleed && settings.bleedUsed > 0) {
    add('bleed-made', 'info', `We made ${fmtMm(settings.bleedUsed)} mm bleed`,
      `Your file had no bleed, so we extended the design past the cut line ${plan.madeBleed === 'mirror' ? 'by mirroring its edges' : 'by stretching its edge colours'}. That extra part is cut off. Text and shapes inside the cut stay sharp. Check the Print sheet view, and change it in the Bleed box if needed.`);
  } else if (settings.bleedUsed === 0 && plan.inkTouches) {
    add('no-bleed-ink', 'caution', 'No bleed, and colour touches the edge',
      'After cutting, a thin white line may show on some edges. Choose Mirror or Stretch in the Bleed box to make bleed automatically.');
  } else if (settings.bleedUsed === 0) {
    add('no-bleed', 'info', 'No bleed',
      'Bleed is extra colour past the cut line. Without it, designs with colour touching the edge can show a thin white line after cutting. Designs with white edges are fine.', true);
  }
  if (settings.bleedUsed === 0) {
    if (settings.gap === 0) {
      add('shared-cuts', 'info', 'Pieces share cut lines',
        'One cut separates two pieces. That makes cutting faster, but a small cutting error shows on both pieces.', true);
    }
  }

  if (layout.bleedClipped) {
    add('bleed-clipped', 'caution', 'Gap is smaller than the bleed',
      `Each piece has ${fmtMm(settings.bleedUsed)} mm bleed, but the gap only leaves room for ${fmtMm(layout.effBleed)} mm. The bleed has been trimmed to fit, so cutting has less room for error.`);
  }

  if (sides.some((p) => p.rotation !== 0)) {
    add('page-rotated', 'caution', 'This file has rotated pages',
      'The preview shows the page without its rotation setting. Check the preview carefully before printing.');
  }

  // ----- Front and back -----
  if (twoSided) {
    const turn = plan.flip === 'calendar' ? 'like a calendar (top to bottom)' : 'like a book page (left to right)';
    const edge = flipEdgeName(plan.flip, sheet.orientation);
    if (printer.duplex) {
      add('duplex', 'info', 'Front and back',
        `Page 1 is the front and page 2 is the back. In the print window choose double-sided, "Flip on ${edge}". The back is arranged for the sheet turning ${turn}.`, true);
    } else {
      add('no-duplex', 'caution', 'Your printer prints one side at a time',
        `Print page 1 (front) for all sheets. Put the printed stack back in, turned ${turn}, then print page 2 (back). Test with one sheet first.`);
    }
    if (geometry.pageCount > 2) {
      add('extra-pages', 'info', 'Only pages 1 and 2 are used',
        `Your file has ${geometry.pageCount} pages. This tool uses page 1 as the front and page 2 as the back.`, true);
    }
  }

  return list.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

function short(s) {
  return s.length > 30 ? `${s.slice(0, 28)}…` : s;
}
