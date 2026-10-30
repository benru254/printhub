// Renders PDF pages to images for previews, using Mozilla PDF.js.
// The "legacy" build is used on purpose: it works on older Android phones.
// Work is done one page at a time (a queue) so phones don't run out of memory.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const CACHE_MAX_PX = 1200; // bigger renders (full-screen viewer) are not kept

export async function openPdf(bytes) {
  const task = pdfjs.getDocument({ data: bytes.slice() }); // PDF.js takes ownership, give it a copy
  const doc = await task.promise;
  const cache = new Map();
  const textCache = new Map();
  let queue = Promise.resolve();
  let closed = false;

  const enqueue = (work) => {
    const job = queue.then(() => {
      if (closed) throw new Error('closed');
      return work();
    });
    queue = job.catch(() => {});
    return job;
  };

  async function draw(index, maxPx) {
    const page = await doc.getPage(index + 1);
    // rotation: 0 so previews match the output exactly (the output ignores /Rotate).
    const base = page.getViewport({ scale: 1, rotation: 0 });
    const scale = Math.min(6, maxPx / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale, rotation: 0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    // Turns a PDF box (points) into a pixel rectangle on this canvas.
    const rectToPx = (box) => {
      const [x1, y1] = viewport.convertToViewportPoint(box.x, box.y);
      const [x2, y2] = viewport.convertToViewportPoint(box.x + box.width, box.y + box.height);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    };

    return { index, canvas, rectToPx };
  }

  function render(index, maxPx) {
    const key = `${index}@${maxPx}`;
    if (cache.has(key)) return cache.get(key);
    const job = enqueue(() => draw(index, maxPx));
    if (maxPx <= CACHE_MAX_PX) {
      cache.set(key, job);
      job.catch(() => cache.delete(key));
    }
    return job;
  }

  // Real text on a page (for the safe zone check): [{ str, transform, width, height }] in PDF points.
  function text(index) {
    if (!textCache.has(index)) {
      const job = enqueue(async () => {
        const page = await doc.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items
          .filter((it) => typeof it.str === 'string' && it.str.trim())
          .map((it) => ({ str: it.str, transform: it.transform, width: it.width, height: it.height }));
      });
      textCache.set(index, job);
      job.catch(() => textCache.delete(index));
    }
    return textCache.get(index);
  }

  return {
    numPages: doc.numPages,
    render,
    text,
    destroy() {
      closed = true;
      cache.clear();
      textCache.clear();
      task.destroy();
    },
  };
}
