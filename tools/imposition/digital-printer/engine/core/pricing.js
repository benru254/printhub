// PRICES. One place that turns "what the job needs" into "what the customer pays".
// The app uses it to show a live price; the server uses the SAME code to price the order,
// so the two can never disagree. No screen code and no PDF code in here.
//
// How a price is built (all prices are selling prices, per A3 sheet; other sheet sizes
// are priced by their area, so SRA3 costs a little more and A4 costs half):
//   paper + printing (per printed side) + lamination (per laminated side)
//   + cutting + binding  - quantity discount, then never below the minimum order.

export const A3_AREA = 297 * 420;

// EXAMPLE prices in Kenya shillings. The shop owner replaces them under Staff -> Shop.
export const DEFAULT_PRICE_LIST = {
  v: 1,
  currency: 'KES',
  example: true, // true until the shop saves its own prices
  papers: [
    { id: 'bond80', name: 'Plain paper 80 gsm', gsm: 80, priceA3: 5 },
    { id: 'ncr', name: 'Carbonless (NCR) paper', gsm: 55, priceA3: 9 },
    { id: 'art130', name: 'Art paper 130 gsm', gsm: 130, priceA3: 12 },
    { id: 'art170', name: 'Art paper 170 gsm', gsm: 170, priceA3: 16 },
    { id: 'card250', name: 'Art card 250 gsm', gsm: 250, priceA3: 22 },
    { id: 'card300', name: 'Art card 300 gsm', gsm: 300, priceA3: 25 },
    { id: 'card350', name: 'Art card 350 gsm', gsm: 350, priceA3: 30 },
    { id: 'sticker', name: 'Sticker paper', gsm: 0, priceA3: 45, sticker: true },
  ],
  print: { colour: 30, mono: 8 }, // per printed A3 side
  laminate: { matt: 25, gloss: 25 }, // per laminated A3 side
  cutting: { perJob: 100, perSheet: 2 }, // straight cuts on the guillotine
  contourCut: { perSheet: 40 }, // plotter cut around the design
  binding: { staple: 15, glue: 120, pad: 40 }, // per book: stapled booklet, glued spine, glued pad
  discounts: [
    { sheets: 50, pct: 10 },
    { sheets: 200, pct: 20 },
    { sheets: 1000, pct: 30 },
  ],
  minOrder: 300,
  roundTo: 10,
};

export const LAMINATE_CHOICES = ['none', 'matt', 'gloss'];
export const DEFAULT_OPTIONS = { paper: null, colour: true, laminate: 'none' };

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);
const money = (v) => Math.round(v * 100) / 100;

// The paper to use: by id, else the nearest weight (stickers only when asked for).
export function findPaper(priceList, { id, gsm, sticker = false } = {}) {
  const papers = priceList.papers || [];
  const byId = papers.find((p) => p.id === id);
  if (byId) return byId;
  if (sticker) return papers.find((p) => p.sticker) || papers[0];
  const plain = papers.filter((p) => !p.sticker);
  if (gsm) return [...plain].sort((a, b) => Math.abs(a.gsm - gsm) - Math.abs(b.gsm - gsm))[0] || papers[0];
  return plain[0] || papers[0];
}

/**
 * spec (made by each tool from its plan):
 *   { groups: [{ label, sheets, sheetW, sheetH, sides, gsm?, sticker? }],   // what gets printed
 *     cut: 'guillotine' | 'contour' | 'none', books: number, binding: 'staple' | 'glue' | 'pad' | null }
 * options (chosen by the customer): { paper: id | null, colour: boolean, laminate: 'none' | 'matt' | 'gloss' }
 * Returns { currency, lines: [{ label, detail, amount }], subtotal, discountPct, discount, total, sheets, example }
 */
export function quotePrice(spec, options = {}, priceList = DEFAULT_PRICE_LIST) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const pl = priceList || DEFAULT_PRICE_LIST;
  const lines = [];
  let sheets = 0;
  let printed = 0;

  for (const g of (spec && spec.groups) || []) {
    const n = Math.floor(num(g.sheets));
    if (!n) continue;
    const area = (num(g.sheetW, 297) * num(g.sheetH, 420)) / A3_AREA;
    const sides = g.sides === 2 ? 2 : 1;
    // A group with its own weight (book pages, covers) keeps it; otherwise the customer's paper.
    const paper = findPaper(pl, g.gsm ? { gsm: g.gsm } : { id: opt.paper, sticker: !!g.sticker });
    const print = opt.colour === false ? num(pl.print && pl.print.mono) : num(pl.print && pl.print.colour);
    const perSheet = (num(paper && paper.priceA3) + print * sides) * area;
    printed += perSheet * n;
    sheets += n;
    lines.push({
      label: g.label || 'Printing',
      detail: `${n} ${n === 1 ? 'sheet' : 'sheets'} · ${paper ? paper.name : 'paper'} · ${opt.colour === false ? 'black & white' : 'colour'}${sides === 2 ? ' · both sides' : ''}`,
      amount: money(perSheet * n),
    });
    if (opt.laminate !== 'none' && pl.laminate && !g.noLaminate) {
      const lam = num(pl.laminate[opt.laminate]) * area * sides * n;
      if (lam > 0) lines.push({ label: `${opt.laminate === 'matt' ? 'Matt' : 'Gloss'} lamination`, detail: `${n * sides} ${n * sides === 1 ? 'side' : 'sides'}`, amount: money(lam) });
    }
  }

  // Quantity discount on printing and paper only (finishing is hand work, it does not get cheaper).
  const tier = [...(pl.discounts || [])].sort((a, b) => b.sheets - a.sheets).find((d) => sheets >= num(d.sheets, Infinity));
  const discountPct = tier ? Math.min(90, num(tier.pct)) : 0;
  const discount = money((printed * discountPct) / 100);

  if (spec && spec.cut === 'guillotine' && sheets && pl.cutting) {
    lines.push({ label: 'Cutting', detail: 'cut to size', amount: money(num(pl.cutting.perJob) + num(pl.cutting.perSheet) * sheets) });
  }
  if (spec && spec.cut === 'contour' && sheets && pl.contourCut) {
    lines.push({ label: 'Cut around the design', detail: `${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}`, amount: money(num(pl.contourCut.perSheet) * sheets) });
  }
  const books = Math.floor(num(spec && spec.books));
  if (spec && spec.binding && books && pl.binding && num(pl.binding[spec.binding]) > 0) {
    const names = { staple: 'Stapling', glue: 'Glue binding', pad: 'Padding into books' };
    lines.push({ label: names[spec.binding] || 'Binding', detail: `${books} ${books === 1 ? 'book' : 'books'}`, amount: money(num(pl.binding[spec.binding]) * books) });
  }

  const subtotal = money(lines.reduce((a, l) => a + l.amount, 0));
  const step = Math.max(1, num(pl.roundTo, 1));
  let total = Math.ceil((subtotal - discount) / step - 1e-9) * step;
  const minimum = num(pl.minOrder);
  const atMinimum = sheets > 0 && total < minimum;
  if (atMinimum) total = minimum;
  if (!sheets) total = 0;

  return { currency: pl.currency || 'KES', lines, subtotal, discountPct, discount, total, atMinimum, sheets, example: !!pl.example };
}

// "KSh 1,250" (no cents unless there are some)
export function formatMoney(amount, currency = 'KES') {
  const n = Number(amount) || 0;
  const text = n.toLocaleString('en-KE', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return `${currency === 'KES' ? 'KSh' : currency} ${text}`;
}

// Checks a price list typed by the shop owner. Returns a clean copy or throws a clear message.
export function cleanPriceList(input) {
  const src = input && typeof input === 'object' ? input : {};
  const price = (v, what) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new Error(`${what}: enter a price of 0 or more.`);
    return money(n);
  };
  const papers = (Array.isArray(src.papers) ? src.papers : []).slice(0, 40).map((p, i) => {
    const name = String((p && p.name) || '').trim().slice(0, 60);
    if (!name) throw new Error(`Paper ${i + 1}: enter a name.`);
    const id = String((p && p.id) || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || `paper${i + 1}`;
    return { id, name, gsm: Math.round(num(p.gsm)), priceA3: price(p.priceA3, name), ...(p.sticker ? { sticker: true } : {}) };
  });
  if (!papers.length) throw new Error('Add at least one paper.');
  if (new Set(papers.map((p) => p.id)).size !== papers.length) throw new Error('Two papers have the same id.');
  const d = DEFAULT_PRICE_LIST;
  const pick = (group, key, what) => price(src[group] && src[group][key] !== undefined ? src[group][key] : d[group][key], what);
  const discounts = (Array.isArray(src.discounts) ? src.discounts : d.discounts)
    .slice(0, 8)
    .map((t) => ({ sheets: Math.max(1, Math.floor(num(t.sheets, 1))), pct: Math.min(90, num(t.pct)) }))
    .filter((t) => t.pct > 0)
    .sort((a, b) => a.sheets - b.sheets);
  return {
    v: 1,
    currency: String(src.currency || 'KES').toUpperCase().slice(0, 3),
    example: false,
    papers,
    print: { colour: pick('print', 'colour', 'Colour printing'), mono: pick('print', 'mono', 'Black & white printing') },
    laminate: { matt: pick('laminate', 'matt', 'Matt lamination'), gloss: pick('laminate', 'gloss', 'Gloss lamination') },
    cutting: { perJob: pick('cutting', 'perJob', 'Cutting per job'), perSheet: pick('cutting', 'perSheet', 'Cutting per sheet') },
    contourCut: { perSheet: pick('contourCut', 'perSheet', 'Cut around design') },
    binding: { staple: pick('binding', 'staple', 'Stapling'), glue: pick('binding', 'glue', 'Glue binding'), pad: pick('binding', 'pad', 'Padding') },
    discounts,
    minOrder: price(src.minOrder !== undefined ? src.minOrder : d.minOrder, 'Minimum order'),
    roundTo: Math.max(1, Math.round(num(src.roundTo, d.roundTo))),
  };
}
