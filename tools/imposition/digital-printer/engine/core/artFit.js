// How a design is fitted into a finished piece of a (maybe different) size.
//   fill    : design covers the whole piece, keeps its shape, edges may be cut off
//   fit     : whole design visible, keeps its shape, white space may be added
//   stretch : design fills the piece exactly, shape changes
// All sizes in mm. "Piece frame" = the finished piece, origin at its centre.

import { mmToPt, floor1 } from './units.js';

export const FIT_MODES = ['fill', 'fit', 'stretch'];

export function computeArtFit({ srcW, srcH, srcBleed = 0, outW, outH, mode = 'fill' }) {
  let sx;
  let sy;
  if (mode === 'stretch') {
    sx = outW / srcW;
    sy = outH / srcH;
  } else {
    const s = mode === 'fit' ? Math.min(outW / srcW, outH / srcH) : Math.max(outW / srcW, outH / srcH);
    sx = s;
    sy = s;
  }

  const artW = srcW * sx;
  const artH = srcH * sy;
  const EPS = 0.05;
  const coverX = artW >= outW - EPS;
  const coverY = artH >= outH - EPS;

  // Most bleed we can show at this size without running out of design.
  const caps = [];
  if (coverX) caps.push((srcW / 2 + srcBleed) * sx - outW / 2);
  if (coverY) caps.push((srcH / 2 + srcBleed) * sy - outH / 2);
  const maxBleed = caps.length ? Math.max(0, floor1(Math.min(...caps))) : 0;

  return {
    mode,
    outW,
    outH,
    sx,
    sy,
    artW,
    artH,
    coverX,
    coverY,
    maxBleed,
    scale: Math.min(sx, sy),
    distortion: Math.abs(sx / sy - 1),
    cropW: Math.max(0, artW - outW),
    cropH: Math.max(0, artH - outH),
    padW: Math.max(0, outW - artW),
    padH: Math.max(0, outH - artH),
  };
}

/**
 * What to draw for one piece, with `eb` mm of bleed.
 * halfW / halfH : half size of the drawn area in the piece frame (mm)
 * srcBoxPt      : the part of the source PDF page to take (points)
 */
export function pieceDrawing(fit, eb, page) {
  const halfW = fit.coverX ? fit.outW / 2 + eb : fit.artW / 2;
  const halfH = fit.coverY ? fit.outH / 2 + eb : fit.artH / 2;
  const srcHalfW = mmToPt(halfW / fit.sx);
  const srcHalfH = mmToPt(halfH / fit.sy);
  const t = page.trimBoxPt;
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  return {
    halfW,
    halfH,
    srcBoxPt: { x: cx - srcHalfW, y: cy - srcHalfH, width: 2 * srcHalfW, height: 2 * srcHalfH },
  };
}

/**
 * Where a piece sits on the sheet (mm, top-left origin).
 * rot (degrees, anticlockwise like PDF): 0, 90, -90 or 180.
 * The back side is placed so it lines up with the front after the sheet is turned:
 *   flip 'book'     : sheet turns left-right -> back is mirrored left-right
 *   flip 'calendar' : sheet turns top-bottom -> back is mirrored top-bottom and turned 180°
 * halfW/halfH are in the sheet frame.
 */
export function placeOnSheet(slot, drawing, isBack, sheetW, sheetH, flip = 'book') {
  const frontCx = slot.x + slot.w / 2;
  const frontCy = slot.y + slot.h / 2;
  const frontRot = slot.rotated ? 90 : 0;

  let cx = frontCx;
  let cy = frontCy;
  let rot = frontRot;
  if (isBack && flip === 'calendar') {
    cy = sheetH - frontCy;
    rot = slot.rotated ? 90 : 180; // book-back rotation (-90 / 0) turned a further 180°
  } else if (isBack) {
    cx = sheetW - frontCx;
    rot = slot.rotated ? -90 : 0;
  }
  return {
    cx,
    cy,
    rot,
    halfW: slot.rotated ? drawing.halfH : drawing.halfW,
    halfH: slot.rotated ? drawing.halfW : drawing.halfH,
  };
}

// Mirror a crop-mark line for the back side.
export function mirrorLine(l, isBack, sheetW, sheetH, flip = 'book') {
  if (!isBack) return l;
  if (flip === 'calendar') return { x1: l.x1, y1: sheetH - l.y1, x2: l.x2, y2: sheetH - l.y2 };
  return { x1: sheetW - l.x1, y1: l.y1, x2: sheetW - l.x2, y2: l.y2 };
}

// Canvas rotation (y points down) for a PDF rotation (y points up).
export const canvasAngle = (rot) => (-rot * Math.PI) / 180;
