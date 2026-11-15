// Makes the PROOF picture the customer approves: the pages of the design as the shop will
// print them, with the order's facts written underneath. One JPG that opens on any phone.

const W = 1200;
const PAD = 40;

//   pdf = an opened file (lib/pdfRender.js)    pages = page numbers to show (0 = first)
//   heading = "PROOF · Shop name · PH-XXXXXX"  lines = facts to print underneath
export async function makeProof(pdf, pages, { heading, lines = [] }) {
  const renders = await Promise.all(pages.map((i) => pdf.render(i, 1500)));
  const labels = pages.length === 2 ? ['Front', 'Back'] : pages.map((i) => (pages.length > 1 ? `Page ${i + 1}` : ''));
  const pics = renders.map((r) => {
    const s = Math.min((W - 2 * PAD) / r.canvas.width, 1300 / r.canvas.height);
    return { canvas: r.canvas, w: Math.round(r.canvas.width * s), h: Math.round(r.canvas.height * s) };
  });
  const headH = 96;
  const footH = 40 + lines.length * 38 + 60;
  const height = headH + pics.reduce((a, p, i) => a + p.h + (labels[i] ? 50 : 20) + 16, 0) + footH;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, height);

  g.fillStyle = '#111111';
  g.font = '700 34px system-ui, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(fitText(g, heading, W - 2 * PAD), PAD, headH / 2);

  let y = headH;
  pics.forEach((p, i) => {
    if (labels[i]) {
      g.fillStyle = '#555555';
      g.font = '600 26px system-ui, Arial, sans-serif';
      g.fillText(labels[i], PAD, y + 22);
      y += 50;
    } else y += 20;
    const x = Math.round((W - p.w) / 2);
    g.drawImage(p.canvas, x, y, p.w, p.h);
    g.strokeStyle = '#bbbbbb';
    g.lineWidth = 2;
    g.strokeRect(x, y, p.w, p.h);
    y += p.h + 16;
  });

  y += 40;
  g.fillStyle = '#111111';
  g.font = '500 28px system-ui, Arial, sans-serif';
  for (const line of lines) {
    g.fillText(fitText(g, line, W - 2 * PAD), PAD, y);
    y += 38;
  }
  g.fillStyle = '#666666';
  g.font = '400 22px system-ui, Arial, sans-serif';
  g.fillText('Check spelling, numbers and colours. Colours on a screen can differ a little from print.', PAD, y + 20);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The proof picture could not be made.'))), 'image/jpeg', 0.88));
}

function fitText(g, text, max) {
  let t = String(text || '');
  while (t.length > 4 && g.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
  return t;
}
