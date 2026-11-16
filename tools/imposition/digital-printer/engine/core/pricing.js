// PRICES. One place that turns "what the job needs" into "what the customer pays".
// The app uses it to show a live price; the server uses the SAME code to price the order,
// so the two can never disagree. No screen code and no PDF code in here.
//
// How a sheet price is built (all prices are selling prices, per A3 sheet; other sheet sizes
// are priced by their area, so SRA3 costs a little more and A4 costs half):
//   paper + printing (per printed side) + lamination (per laminated side)
//   + cutting + binding  - quantity discount, then never below the minimum order.
//
// The same list also holds the large-format prices (per square metre), the offset press
// prices (plates + setup + running) and the extras (design help, express, delivery).
// Products and their price ladders are worked out in productPrice.js.

export const A3_AREA = 297 * 420;

// EXAMPLE prices in Kenya shillings. The shop owner replaces them under Staff -> Shop.
export const DEFAULT_PRICE_LIST = {
  v: 2,
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

  // LARGE FORMAT: priced per square metre of the finished size.
  // rollWidth = the widest roll of this material the shop's printer takes (mm).
  largeFormat: {
    materials: [
      { id: 'banner', name: 'PVC banner', pricePerSqm: 700, rollWidth: 3200 },
      { id: 'vinyl', name: 'Vinyl sticker', pricePerSqm: 1100, rollWidth: 1520 },
      { id: 'oneway', name: 'One-way vision (windows)', pricePerSqm: 1400, rollWidth: 1520 },
      { id: 'rollupfilm', name: 'Roll-up banner film', pricePerSqm: 1500, rollWidth: 1520 },
      { id: 'satin', name: 'Satin photo paper', pricePerSqm: 1600, rollWidth: 1520 },
      { id: 'canvas', name: 'Canvas', pricePerSqm: 2500, rollWidth: 1520 },
    ],
    eyelet: 10, // each
    hem: 50, // per metre of edge
    pocket: 100, // pole pocket, per metre
    laminate: 400, // per square metre
    rollupStand: 3500, // each
    minSqm: 0.5, // smallest area charged for one piece
  },

  // OFFSET PRESS: big runs. Plates and setup cost the same for 1,000 or 100,000 copies,
  // so the price per piece falls fast. The app compares it with digital and uses the cheaper one.
  offset: {
    enabled: true, // switch it off under Staff -> Shop if the shop never takes offset jobs
    pressName: 'Offset press',
    sheetW: 450, // press sheet, mm
    sheetH: 640,
    gripper: 12, // mm the press holds the sheet by (cannot be printed)
    margin: 5, // the other three edges
    plate: 400, // per plate: one per colour per side
    setup: 1500, // make-ready, per printed side
    runPer1000: 900, // per 1,000 sheets through the press (one side)
    wasteSheets: 50, // sheets lost getting the colour right
    wastePct: 3, // and a few more while running
    paperPct: 80, // press paper is bought in bulk: % of the digital paper price for the same area
    minQuantity: 1000, // smaller jobs always go digital
    extraDays: 3, // offset takes this many working days longer
  },

  design: { fee: 500 }, // "I don't have a design": the shop makes one
  rush: { enabled: true, pct: 30, days: 1 }, // express: +30%, ready in 1 working day
  delivery: { enabled: true, fee: 200, note: 'Within town' },
};

export const LAMINATE_CHOICES = ['none', 'matt', 'gloss'];
export const DEFAULT_OPTIONS = { paper: null, colour: true, laminate: 'none' };

export const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);
export const money = (v) => Math.round(v * 100) / 100;

// Rounds a price UP to the shop's step (KSh 10): 532 -> 540.
export function roundUp(amount, priceList) {
  const step = Math.max(1, num(priceList && priceList.roundTo, 1));
  return Math.ceil(amount / step - 1e-9) * step;
}

// A price list saved before large format, offset and extras existed still works:
// the missing parts come from the example list.
export function fullPriceList(priceList) {
  const pl = priceList && typeof priceList === 'object' ? priceList : {};
  const d = DEFAULT_PRICE_LIST;
  const group = (key) => ({ ...d[key], ...(pl[key] && typeof pl[key] === 'object' ? pl[key] : {}) });
  return {
    ...d,
    ...pl,
    papers: Array.isArray(pl.papers) && pl.papers.length ? pl.papers : d.papers,
    print: group('print'),
    laminate: group('laminate'),
    cutting: group('cutting'),
    contourCut: group('contourCut'),
    binding: group('binding'),
    discounts: Array.isArray(pl.discounts) ? pl.discounts : d.discounts,
    largeFormat: {
      ...group('largeFormat'),
      materials: pl.largeFormat && Array.isArray(pl.largeFormat.materials) && pl.largeFormat.materials.length ? pl.largeFormat.materials : d.largeFormat.materials,
    },
    offset: group('offset'),
    design: group('design'),
    rush: group('rush'),
    delivery: group('delivery'),
  };
}

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

export function findMaterial(priceList, id) {
  const list = (priceList.largeFormat && priceList.largeFormat.materials) || [];
  return list.find((m) => m.id === id) || list[0] || null;
}

/**
 * spec (made by each tool from its plan):
 *   { groups: [{ label, sheets, sheetW, sheetH, sides, paper?, gsm?, sticker?, noLaminate? }],   // what gets printed
 *     cut: 'guillotine' | 'contour' | 'none', books: number, binding: 'staple' | 'glue' | 'pad' | null }
 *   A group with its own `paper` (an id from the price list) or `gsm` keeps it; the others use the customer's paper.
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
    const paper = findPaper(pl, g.paper ? { id: g.paper, sticker: !!g.sticker } : g.gsm ? { gsm: g.gsm } : { id: opt.paper, sticker: !!g.sticker });
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
  let total = roundUp(subtotal - discount, pl);
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
  const d = DEFAULT_PRICE_LIST;
  const price = (v, what) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new Error(`${what}: enter a price of 0 or more.`);
    return money(n);
  };
  const makeId = (value, fallback) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || fallback;
  const papers = (Array.isArray(src.papers) ? src.papers : []).slice(0, 40).map((p, i) => {
    const name = String((p && p.name) || '').trim().slice(0, 60);
    if (!name) throw new Error(`Paper ${i + 1}: enter a name.`);
    return { id: makeId(p && p.id, `paper${i + 1}`), name, gsm: Math.round(num(p.gsm)), priceA3: price(p.priceA3, name), ...(p.sticker ? { sticker: true } : {}) };
  });
  if (!papers.length) throw new Error('Add at least one paper.');
  if (new Set(papers.map((p) => p.id)).size !== papers.length) throw new Error('Two papers have the same id.');
  // A value the shop typed, else the example value.
  const pick = (group, key, what) => price(src[group] && src[group][key] !== undefined ? src[group][key] : d[group][key], what);
  const whole = (group, key, min, max) => {
    const v = src[group] && src[group][key] !== undefined ? Number(src[group][key]) : d[group][key];
    return Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : d[group][key])));
  };
  const flag = (group, key) => (src[group] && src[group][key] !== undefined ? !!src[group][key] : d[group][key]);
  const discounts = (Array.isArray(src.discounts) ? src.discounts : d.discounts)
    .slice(0, 8)
    .map((t) => ({ sheets: Math.max(1, Math.floor(num(t.sheets, 1))), pct: Math.min(90, num(t.pct)) }))
    .filter((t) => t.pct > 0)
    .sort((a, b) => a.sheets - b.sheets);

  const lf = src.largeFormat && typeof src.largeFormat === 'object' ? src.largeFormat : {};
  const materials = (Array.isArray(lf.materials) && lf.materials.length ? lf.materials : d.largeFormat.materials).slice(0, 30).map((m, i) => {
    const name = String((m && m.name) || '').trim().slice(0, 60);
    if (!name) throw new Error(`Large format material ${i + 1}: enter a name.`);
    const roll = Math.round(num(m.rollWidth, 1520));
    if (roll < 200 || roll > 6000) throw new Error(`${name}: the roll width must be between 200 and 6000 mm.`);
    return { id: makeId(m && m.id, `material${i + 1}`), name, pricePerSqm: price(m.pricePerSqm, name), rollWidth: roll };
  });
  if (new Set(materials.map((m) => m.id)).size !== materials.length) throw new Error('Two large format materials have the same id.');

  return {
    v: 2,
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
    largeFormat: {
      materials,
      eyelet: pick('largeFormat', 'eyelet', 'Eyelets'),
      hem: pick('largeFormat', 'hem', 'Hemming'),
      pocket: pick('largeFormat', 'pocket', 'Pole pockets'),
      laminate: pick('largeFormat', 'laminate', 'Large format lamination'),
      rollupStand: pick('largeFormat', 'rollupStand', 'Roll-up stand'),
      minSqm: Math.min(10, Math.max(0, num(lf.minSqm, d.largeFormat.minSqm))),
    },
    offset: {
      enabled: flag('offset', 'enabled'),
      pressName: String((src.offset && src.offset.pressName) || d.offset.pressName).trim().slice(0, 40) || d.offset.pressName,
      sheetW: whole('offset', 'sheetW', 200, 2000),
      sheetH: whole('offset', 'sheetH', 200, 2000),
      gripper: whole('offset', 'gripper', 0, 50),
      margin: whole('offset', 'margin', 0, 50),
      plate: pick('offset', 'plate', 'Offset plate'),
      setup: pick('offset', 'setup', 'Offset setup'),
      runPer1000: pick('offset', 'runPer1000', 'Offset running'),
      wasteSheets: whole('offset', 'wasteSheets', 0, 5000),
      wastePct: whole('offset', 'wastePct', 0, 50),
      paperPct: whole('offset', 'paperPct', 1, 200),
      minQuantity: whole('offset', 'minQuantity', 1, 1000000),
      extraDays: whole('offset', 'extraDays', 0, 60),
    },
    design: { fee: pick('design', 'fee', 'Design fee') },
    rush: { enabled: flag('rush', 'enabled'), pct: whole('rush', 'pct', 0, 300), days: whole('rush', 'days', 0, 30) },
    delivery: {
      enabled: flag('delivery', 'enabled'),
      fee: pick('delivery', 'fee', 'Delivery fee'),
      note: String(src.delivery && src.delivery.note !== undefined ? src.delivery.note : d.delivery.note).trim().slice(0, 80),
    },
  };
}
