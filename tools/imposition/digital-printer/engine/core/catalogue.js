// THE CATALOGUE: what the shop sells, in the words customers use ("business cards",
// "a banner"), not in print-shop words ("step and repeat on SRA3").
// A customer picks a product, a quantity and a few options. From that the app knows the
// price (productPrice.js), which tool the operator opens the job in, and how long it takes.
// The shop edits this list under Staff -> Products. No screen code and no PDF code in here.
//
// kind = how the product is made and priced:
//   'sheet'   flat pieces cut from printed sheets (cards, flyers, posters, stickers)
//   'booklet' pages bound into a book (stapled up to 64 pages, glued above that)
//   'pad'     numbered receipt / invoice books on carbonless paper
//   'area'    large format, priced per square metre (banners, vinyl, canvas)

import { money } from './pricing.js';

export const PRODUCT_KINDS = ['sheet', 'booklet', 'pad', 'area'];

export const PRODUCT_GROUPS = [
  { id: 'cards', name: 'Cards & flyers' },
  { id: 'stickers', name: 'Stickers' },
  { id: 'books', name: 'Books' },
  { id: 'large', name: 'Banners & large' },
];

export const FINISHING = {
  eyelets: 'Eyelets (rings for hanging)',
  hem: 'Hemmed edges (stronger)',
  pockets: 'Pole pockets (top and bottom)',
  laminate: 'Lamination (lasts longer outdoors)',
};

const A = { A6: [105, 148], A5: [148, 210], A4: [210, 297], A3: [297, 420], DL: [99, 210] };
const size = (id, name, w, h) => ({ id, name, w, h });
const paper = (id) => size(id, id, A[id][0], A[id][1]);

// EXAMPLE products. Prices come from the price list unless a product has its own price table.
export const DEFAULT_CATALOGUE = {
  v: 1,
  products: [
    {
      id: 'business-cards', name: 'Business cards', group: 'cards', kind: 'sheet', icon: 'card', popular: true,
      blurb: 'Thick card, cut to size',
      sizes: [size('90x55', '90 × 55 mm', 90, 55), size('85x55', '85 × 55 mm', 85, 55)],
      quantities: [100, 200, 500, 1000], unit: 'cards',
      papers: ['card300', 'card350', 'card250'], sides: [2, 1], laminate: ['none', 'matt', 'gloss'],
      cut: 'guillotine', days: 1, offset: true,
    },
    {
      id: 'flyers', name: 'Flyers', group: 'cards', kind: 'sheet', icon: 'flyer', popular: true,
      blurb: 'Handouts in A6, A5, DL or A4',
      sizes: [paper('A5'), paper('A6'), paper('DL'), paper('A4')],
      quantities: [50, 100, 250, 500, 1000, 5000], unit: 'flyers',
      papers: ['art130', 'art170', 'bond80'], sides: [1, 2], laminate: ['none'],
      cut: 'guillotine', days: 1, offset: true,
    },
    {
      id: 'posters', name: 'Posters', group: 'cards', kind: 'sheet', icon: 'poster', popular: true,
      blurb: 'A4 and A3, for walls and notice boards',
      sizes: [paper('A3'), paper('A4')],
      quantities: [1, 5, 10, 25, 50, 100], unit: 'posters',
      papers: ['art170', 'card250', 'art130'], sides: [1], laminate: ['none', 'matt', 'gloss'],
      cut: 'none', days: 1, offset: true,
    },
    {
      id: 'invitation-cards', name: 'Invitation cards', group: 'cards', kind: 'sheet', icon: 'invite',
      blurb: 'Weddings, graduations, events',
      sizes: [paper('A6'), paper('A5'), paper('DL')],
      quantities: [20, 50, 100, 200, 500], unit: 'cards',
      papers: ['card300', 'card250', 'card350'], sides: [1, 2], laminate: ['none', 'matt', 'gloss'],
      cut: 'guillotine', days: 2,
    },
    {
      id: 'certificates', name: 'Certificates', group: 'cards', kind: 'sheet', icon: 'certificate',
      blurb: 'A4 on card',
      sizes: [paper('A4')],
      quantities: [1, 10, 25, 50, 100], unit: 'certificates',
      papers: ['card250', 'card300'], sides: [1], laminate: ['none'],
      cut: 'none', days: 1,
    },
    {
      id: 'letterheads', name: 'Letterheads', group: 'cards', kind: 'sheet', icon: 'letterhead',
      blurb: 'A4 office paper with your logo',
      sizes: [paper('A4')],
      quantities: [100, 250, 500, 1000, 2000], unit: 'sheets',
      papers: ['bond80'], sides: [1], laminate: ['none'],
      cut: 'guillotine', days: 2, offset: true,
    },
    {
      id: 'stickers', name: 'Stickers & labels', group: 'stickers', kind: 'sheet', icon: 'sticker', popular: true,
      blurb: 'Cut around your design. Any size.',
      sizes: [size('50x50', '50 × 50 mm', 50, 50), size('70x70', '70 × 70 mm', 70, 70), size('100x100', '100 × 100 mm', 100, 100), size('60x40', '60 × 40 mm', 60, 40)],
      customSize: true,
      quantities: [50, 100, 250, 500, 1000], unit: 'stickers',
      papers: ['sticker'], sides: [1], laminate: ['none'],
      cut: 'contour', sticker: true, shape: 'contour', days: 2,
    },
    {
      id: 'booklets', name: 'Booklets', group: 'books', kind: 'booklet', icon: 'booklet',
      blurb: 'Stapled: programmes, menus, catalogues',
      sizes: [paper('A5'), paper('A4'), paper('A6')],
      quantities: [10, 25, 50, 100, 250, 500], unit: 'booklets',
      papers: ['art130', 'bond80', 'art170'], colours: ['colour', 'mono'], laminate: ['none'],
      pages: { min: 8, max: 64, step: 4, start: 12 }, cover: true, coverPaper: 'card250',
      days: 3,
    },
    {
      id: 'books', name: 'Books & reports', group: 'books', kind: 'booklet', icon: 'book',
      blurb: 'Glued spine: reports, theses, manuals',
      sizes: [paper('A4'), paper('A5')],
      quantities: [1, 5, 10, 25, 50, 100], unit: 'books',
      papers: ['bond80', 'art130'], colours: ['mono', 'colour'], laminate: ['none', 'matt', 'gloss'],
      pages: { min: 40, max: 600, step: 2, start: 100 }, cover: true, coverPaper: 'card300', binding: 'glue',
      days: 3,
    },
    {
      id: 'receipt-books', name: 'Receipt & invoice books', group: 'books', kind: 'pad', icon: 'receipt', popular: true,
      blurb: 'Numbered, with carbonless copies',
      sizes: [paper('A5'), paper('A6'), paper('A4')],
      quantities: [5, 10, 20, 50, 100], unit: 'books',
      papers: ['ncr'], colours: ['mono', 'colour'],
      parts: [2, 3, 1], sets: [50, 100],
      days: 3,
    },
    {
      id: 'banners', name: 'Banners', group: 'large', kind: 'area', icon: 'banner', popular: true,
      blurb: 'PVC, any size, with rings for hanging',
      presets: [size('1x2', '1 × 2 m', 1000, 2000), size('1x3', '1 × 3 m', 1000, 3000), size('2x3', '2 × 3 m', 2000, 3000), size('2x4', '2 × 4 m', 2000, 4000)],
      customSize: true,
      quantities: [1, 2, 5, 10], unit: 'banners',
      materials: ['banner'], finishing: ['eyelets', 'hem', 'pockets'], finishingOn: ['eyelets', 'hem'],
      days: 1,
    },
    {
      id: 'rollup', name: 'Roll-up banner', group: 'large', kind: 'area', icon: 'rollup', popular: true,
      blurb: '85 × 200 cm with stand and bag',
      presets: [size('85x200', '85 × 200 cm', 850, 2000)],
      quantities: [1, 2, 5, 10], unit: 'roll-ups',
      materials: ['rollupfilm'], finishing: [], includes: ['rollupStand'],
      days: 1,
    },
    {
      id: 'vinyl', name: 'Vinyl stickers (large)', group: 'large', kind: 'area', icon: 'vinyl',
      blurb: 'Shop windows, walls, vehicles',
      presets: [size('1x1', '1 × 1 m', 1000, 1000), size('1x2', '1 × 2 m', 1000, 2000), size('50x50', '50 × 50 cm', 500, 500)],
      customSize: true,
      quantities: [1, 2, 5, 10], unit: 'pieces',
      materials: ['vinyl', 'oneway'], finishing: ['laminate'],
      days: 1,
    },
    {
      id: 'large-posters', name: 'Large posters & canvas', group: 'large', kind: 'area', icon: 'canvas',
      blurb: 'A2, A1, A0 on photo paper or canvas',
      presets: [size('A2', 'A2 (42 × 59 cm)', 420, 594), size('A1', 'A1 (59 × 84 cm)', 594, 841), size('A0', 'A0 (84 × 119 cm)', 841, 1189)],
      customSize: true,
      quantities: [1, 2, 5, 10, 20], unit: 'prints',
      materials: ['satin', 'canvas'], finishing: [],
      days: 1,
    },
  ],
};

// Limits for a size typed by a customer (mm).
export const SHEET_SIZE_LIMITS = { min: 20, max: 450 };
export const AREA_SIZE_LIMITS = { min: 100, max: 50000 };

export function activeProducts(catalogue) {
  return ((catalogue && catalogue.products) || DEFAULT_CATALOGUE.products).filter((p) => p.active !== false);
}

export function findProduct(catalogue, id) {
  return ((catalogue && catalogue.products) || DEFAULT_CATALOGUE.products).find((p) => p.id === id) || null;
}

const whole = (v, min, max, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const oneOf = (list, value, fallback) => (Array.isArray(list) && list.includes(value) ? value : fallback);

// The size list of a product (sheet kinds call them sizes, large format calls them presets).
export const productSizes = (product) => (product.kind === 'area' ? product.presets : product.sizes) || [];

/**
 * Turns whatever the phone sent into a choice this product really offers.
 * Anything missing or not allowed becomes the product's first (default) option, so a
 * choice is always complete and safe to price. The same code runs on the phone and the server.
 */
export function cleanChoice(product, raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sizes = productSizes(product);
  const limits = product.kind === 'area' ? AREA_SIZE_LIMITS : SHEET_SIZE_LIMITS;
  const c = { quantity: whole(r.quantity, 1, 1000000, (product.quantities && product.quantities[0]) || 1) };

  // Size: one from the list, or the customer's own when the product allows it.
  const listed = sizes.find((s) => s.id === r.size);
  const w = Number(r.w);
  const h = Number(r.h);
  const ownOk = product.customSize && w >= limits.min && w <= limits.max && h >= limits.min && h <= limits.max;
  if (r.size === 'custom' && ownOk) Object.assign(c, { size: 'custom', w: Math.round(w), h: Math.round(h) });
  else {
    const s = listed || sizes[0];
    Object.assign(c, { size: s.id, w: s.w, h: s.h });
  }

  if (product.kind === 'area') {
    c.material = oneOf(product.materials, r.material, product.materials[0]);
    const offered = product.finishing || [];
    const wanted = r.finish && typeof r.finish === 'object' ? r.finish : null;
    c.finish = {};
    for (const f of offered) c.finish[f] = wanted ? !!wanted[f] : (product.finishingOn || []).includes(f);
    return c;
  }

  c.paper = oneOf(product.papers, r.paper, product.papers[0]);
  const colours = product.colours || ['colour'];
  c.colour = oneOf(colours, r.colour === false || r.colour === 'mono' ? 'mono' : r.colour === true || r.colour === 'colour' ? 'colour' : null, colours[0]) === 'colour';
  c.laminate = oneOf(product.laminate || ['none'], r.laminate, (product.laminate || ['none'])[0]);

  if (product.kind === 'sheet') {
    c.sides = oneOf(product.sides || [1], Number(r.sides), (product.sides || [1])[0]);
  } else if (product.kind === 'booklet') {
    const p = product.pages || { min: 8, max: 64, step: 4, start: 8 };
    const asked = whole(r.pages, 1, 100000, p.start);
    c.pages = Math.min(p.max, Math.max(p.min, Math.ceil(asked / p.step) * p.step));
    c.cover = product.cover ? r.cover !== false : false;
  } else if (product.kind === 'pad') {
    c.parts = oneOf(product.parts || [2], Number(r.parts), (product.parts || [2])[0]);
    c.sets = oneOf(product.sets || [50], Number(r.sets), (product.sets || [50])[0]);
    c.numberFrom = whole(r.numberFrom, 0, 99999999, 1);
  }
  return c;
}

// The product's own default choice (first of everything), at a given quantity.
export const defaultChoice = (product, quantity) => cleanChoice(product, quantity ? { quantity } : {});

// 2000 x 1000 mm -> "2 × 1 m", 850 x 2000 -> "85 × 200 cm", 90 x 55 -> "90 × 55 mm"
export function sizeText(w, h) {
  const trim = (n) => String(Math.round(n * 100) / 100);
  if (w >= 1000 && h >= 1000 && w % 100 === 0 && h % 100 === 0) return `${trim(w / 1000)} × ${trim(h / 1000)} m`;
  if (Math.max(w, h) >= 300 && w % 10 === 0 && h % 10 === 0) return `${trim(w / 10)} × ${trim(h / 10)} cm`;
  return `${trim(w)} × ${trim(h)} mm`;
}

export function choiceSizeName(product, choice) {
  const listed = productSizes(product).find((s) => s.id === choice.size);
  return listed ? listed.name : sizeText(choice.w, choice.h);
}

// The choice in one plain line, for the order list, the job ticket and the receipt.
export function choiceText(product, choice, priceList) {
  const parts = [choiceSizeName(product, choice)];
  if (product.kind === 'area') {
    const m = ((priceList.largeFormat && priceList.largeFormat.materials) || []).find((x) => x.id === choice.material);
    if (m) parts.push(m.name);
    for (const f of Object.keys(choice.finish || {})) if (choice.finish[f]) parts.push(f === 'hem' ? 'hemmed' : f === 'pockets' ? 'pole pockets' : f === 'laminate' ? 'laminated' : f);
    for (const inc of product.includes || []) if (inc === 'rollupStand') parts.push('with stand');
    return parts.join(' · ');
  }
  const p = (priceList.papers || []).find((x) => x.id === choice.paper);
  if (product.kind === 'booklet') parts.push(`${choice.pages} pages`);
  if (product.kind === 'pad') {
    parts.push(choice.parts === 1 ? 'single sheets' : choice.parts === 2 ? 'duplicate' : 'triplicate');
    parts.push(`${choice.sets} per book`);
    parts.push(`numbered from ${choice.numberFrom}`);
  }
  if (p) parts.push(p.name);
  parts.push(choice.colour ? 'colour' : 'black & white');
  if (product.kind === 'sheet' && (product.sides || []).length > 1) parts.push(choice.sides === 2 ? 'both sides' : 'one side');
  if (choice.laminate && choice.laminate !== 'none') parts.push(`${choice.laminate} lamination`);
  return parts.join(' · ');
}

// Checks a catalogue edited by the shop owner. Returns a clean copy or throws a clear message.
export function cleanCatalogue(input) {
  const list = input && Array.isArray(input.products) ? input.products : null;
  if (!list || !list.length) throw new Error('Add at least one product.');
  if (list.length > 80) throw new Error('That is too many products (80 at most).');
  const text = (v, max) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
  const slug = (v) => text(v, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ids = (v, max = 12) => (Array.isArray(v) ? v : []).map((x) => text(x, 30)).filter(Boolean).slice(0, max);
  const seen = new Set();

  const products = list.map((raw, i) => {
    const p = raw && typeof raw === 'object' ? raw : {};
    const name = text(p.name, 50);
    if (!name) throw new Error(`Product ${i + 1}: enter a name.`);
    let id = slug(p.id) || slug(name) || `product-${i + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const kind = PRODUCT_KINDS.includes(p.kind) ? p.kind : 'sheet';
    const limits = kind === 'area' ? AREA_SIZE_LIMITS : SHEET_SIZE_LIMITS;
    const sizes = (Array.isArray(kind === 'area' ? p.presets : p.sizes) ? (kind === 'area' ? p.presets : p.sizes) : []).slice(0, 12).map((s, k) => {
      const w = Math.round(Number(s && s.w));
      const h = Math.round(Number(s && s.h));
      if (!(w >= limits.min && w <= limits.max && h >= limits.min && h <= limits.max)) {
        throw new Error(`${name}: size ${k + 1} must be between ${limits.min} and ${limits.max} mm.`);
      }
      return { id: slug(s.id) || `${w}x${h}`, name: text(s.name, 30) || sizeText(w, h), w, h };
    });
    if (!sizes.length) throw new Error(`${name}: add at least one size.`);
    const quantities = [...new Set((Array.isArray(p.quantities) ? p.quantities : []).map((q) => Math.floor(Number(q))).filter((q) => q >= 1 && q <= 1000000))].sort((a, b) => a - b).slice(0, 10);
    if (!quantities.length) throw new Error(`${name}: add at least one quantity.`);
    const priceTable = (Array.isArray(p.priceTable) ? p.priceTable : [])
      .map((r) => ({ qty: Math.floor(Number(r && r.qty)), price: money(Number(r && r.price)) }))
      .filter((r) => r.qty >= 1 && r.price > 0 && r.price < 1e8)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 12);

    const out = {
      id, name, kind,
      group: PRODUCT_GROUPS.some((g) => g.id === p.group) ? p.group : 'cards',
      icon: text(p.icon, 20) || 'flyer',
      blurb: text(p.blurb, 80),
      ...(p.active === false ? { active: false } : {}),
      ...(p.popular ? { popular: true } : {}),
      ...(kind === 'area' ? { presets: sizes } : { sizes }),
      ...(p.customSize ? { customSize: true } : {}),
      quantities,
      unit: text(p.unit, 20) || 'pieces',
      days: whole(p.days, 0, 60, 2),
      ...(priceTable.length ? { priceTable } : {}),
      ...(Number(p.designFee) >= 0 && p.designFee !== undefined && p.designFee !== null && p.designFee !== '' ? { designFee: money(Number(p.designFee)) } : {}),
    };

    if (kind === 'area') {
      out.materials = ids(p.materials);
      if (!out.materials.length) throw new Error(`${name}: choose at least one material.`);
      out.finishing = ids(p.finishing).filter((f) => FINISHING[f]);
      out.finishingOn = ids(p.finishingOn).filter((f) => out.finishing.includes(f));
      const includes = ids(p.includes).filter((x) => x === 'rollupStand');
      if (includes.length) out.includes = includes;
      return out;
    }

    out.papers = ids(p.papers);
    if (!out.papers.length) throw new Error(`${name}: choose at least one paper.`);
    const colours = ids(p.colours).filter((c) => c === 'colour' || c === 'mono');
    if (colours.length) out.colours = colours;
    const laminate = ids(p.laminate).filter((l) => ['none', 'matt', 'gloss'].includes(l));
    out.laminate = laminate.length ? laminate : ['none'];
    if (kind === 'sheet') {
      const sides = [...new Set((Array.isArray(p.sides) ? p.sides : [1]).map(Number).filter((s) => s === 1 || s === 2))];
      out.sides = sides.length ? sides : [1];
      out.cut = ['guillotine', 'contour', 'none'].includes(p.cut) ? p.cut : 'guillotine';
      if (p.sticker) out.sticker = true;
      if (['rect', 'rounded', 'ellipse', 'contour'].includes(p.shape)) out.shape = p.shape;
      if (p.offset) out.offset = true;
    } else if (kind === 'booklet') {
      const pg = p.pages && typeof p.pages === 'object' ? p.pages : {};
      const step = whole(pg.step, 1, 16, 4);
      const min = whole(pg.min, 2, 2000, 8);
      const max = Math.max(min, whole(pg.max, 2, 2000, 64));
      out.pages = { min, max, step, start: Math.min(max, Math.max(min, whole(pg.start, 2, 2000, min))) };
      out.cover = p.cover !== false;
      out.coverPaper = text(p.coverPaper, 30) || 'card250';
      if (p.binding === 'glue') out.binding = 'glue';
    } else if (kind === 'pad') {
      const parts = [...new Set((Array.isArray(p.parts) ? p.parts : [2]).map(Number).filter((n) => n >= 1 && n <= 3))];
      out.parts = parts.length ? parts : [2];
      const sets = [...new Set((Array.isArray(p.sets) ? p.sets : [50]).map((n) => Math.floor(Number(n))).filter((n) => n >= 5 && n <= 500))];
      out.sets = sets.length ? sets : [50];
    }
    return out;
  });

  return { v: 1, products };
}
