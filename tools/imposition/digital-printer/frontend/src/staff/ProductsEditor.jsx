import { useEffect, useMemo, useState } from 'react';
import { priceLadder, pricingContext, formatMoney, fullPriceList, PRODUCT_GROUPS, FINISHING, sizeText } from '@engine';
import { api } from '../lib/api.js';
import { store } from '../lib/storage.js';
import ProductIcon, { PRODUCT_ICONS } from '../products/ProductIcon.jsx';

const KINDS = [
  { value: 'sheet', label: 'Flat prints (cards, flyers, stickers)' },
  { value: 'booklet', label: 'Books and booklets' },
  { value: 'pad', label: 'Numbered receipt books' },
  { value: 'area', label: 'Large format (per square metre)' },
];

// A new product of each kind, ready to edit.
function blank(kind, pl) {
  const base = { id: `product-${Date.now() % 100000}`, name: 'New product', group: kind === 'area' ? 'large' : kind === 'sheet' ? 'cards' : 'books', kind, icon: kind === 'area' ? 'banner' : 'flyer', blurb: '', quantities: [1, 10, 50, 100], unit: 'pieces', days: 2 };
  if (kind === 'area') return { ...base, presets: [{ id: '1x1', name: '1 × 1 m', w: 1000, h: 1000 }], customSize: true, materials: [pl.largeFormat.materials[0].id], finishing: [], finishingOn: [] };
  const paper = pl.papers[0].id;
  if (kind === 'booklet') return { ...base, sizes: [{ id: 'A5', name: 'A5', w: 148, h: 210 }], papers: [paper], laminate: ['none'], pages: { min: 8, max: 64, step: 4, start: 12 }, cover: true, coverPaper: 'card250' };
  if (kind === 'pad') return { ...base, sizes: [{ id: 'A5', name: 'A5', w: 148, h: 210 }], papers: [paper], colours: ['mono', 'colour'], parts: [2, 3], sets: [50, 100], unit: 'books' };
  return { ...base, sizes: [{ id: 'A5', name: 'A5', w: 148, h: 210 }], papers: [paper], sides: [1, 2], laminate: ['none'], cut: 'guillotine' };
}

// Tick boxes for "which of these does the product offer". The first ticked one is the default.
function Pick({ label, hint, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="pe-field">
      <div className="field-label">{label}{hint && <small className="hint inline-hint">{hint}</small>}</div>
      <div className="pe-picks">
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={value.includes(o.value)} className={`group ${value.includes(o.value) ? 'group-on' : ''}`} onClick={() => toggle(o.value)}>
            {o.label}{value[0] === o.value && value.length > 1 ? ' ★' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

function Text({ label, hint, value, onChange, type = 'text', ...rest }) {
  return (
    <label className="price-field">
      <span>{label}{hint && <small> · {hint}</small>}</span>
      <input className="num" type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

// Admin: what the shop sells. Switch products on and off, change names, sizes, quantities
// and options, and pin exact prices ("100 cards = 500") when the price list sum is not
// what the shop charges.
export default function ProductsEditor({ shop }) {
  const [catalogue, setCatalogue] = useState(null);
  const [open, setOpen] = useState(null); // id of the product being edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [dirty, setDirty] = useState(false);
  const pl = useMemo(() => fullPriceList(shop.priceList), [shop.priceList]);
  const ctx = useMemo(() => pricingContext(shop), [shop.priceList, shop.printers, shop.customSheets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api('/shop').then((r) => setCatalogue(r.catalogue)).catch((e) => setError(e.message));
  }, []);

  if (!catalogue) return error ? <p className="error">{error}</p> : <p className="hint">Loading…</p>;

  const change = (id, patch) => {
    setCatalogue({ ...catalogue, products: catalogue.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    setDirty(true);
    setDone('');
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await api('/shop', { method: 'PUT', auth: true, json: { catalogue } });
      setCatalogue(r.catalogue);
      shop.set(r);
      store.set('shopCache', r);
      setDirty(false);
      setDone('Products saved. Customers see them straight away.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function add(kind) {
    const p = blank(kind, pl);
    setCatalogue({ ...catalogue, products: [...catalogue.products, p] });
    setOpen(p.id);
    setDirty(true);
  }

  const papers = pl.papers.map((p) => ({ value: p.id, label: p.name }));
  const materials = pl.largeFormat.materials.map((m) => ({ value: m.id, label: m.name }));
  const numbers = (text) => String(text).split(/[\s,;]+/).map((n) => Math.floor(Number(n))).filter((n) => n >= 1);

  return (
    <div className="staff-list">
      <p className="hint">What customers can order. Tap a product to change it. ★ marks the option a customer gets if they do not choose.</p>
      {catalogue.products.map((p) => {
        const isOpen = open === p.id;
        const sizes = p.kind === 'area' ? p.presets : p.sizes;
        const sizeKey = p.kind === 'area' ? 'presets' : 'sizes';
        let ladder = [];
        try {
          ladder = priceLadder(p, {}, ctx);
        } catch {
          ladder = []; // half-typed product: no preview yet
        }
        return (
          <div key={p.id} className={`card pe-product ${p.active === false ? 'row-off' : ''}`}>
            <div className="pe-head">
              <button type="button" className="pe-open" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                <ProductIcon id={p.icon} />
                <span>
                  <strong>{p.name}</strong>
                  <span className="hint">{ladder.filter((r) => r.total > 0).slice(0, 3).map((r) => `${r.quantity} = ${formatMoney(r.total, pl.currency)}`).join(' · ') || 'no price yet'}</span>
                </span>
              </button>
              <input type="checkbox" className="switch" aria-label={`${p.name} is on sale`} checked={p.active !== false} onChange={(e) => change(p.id, { active: e.target.checked })} />
            </div>

            {isOpen && (
              <div className="pe-body">
                <Text label="Name" value={p.name} maxLength={50} onChange={(name) => change(p.id, { name })} />
                <Text label="Short description" value={p.blurb} maxLength={80} onChange={(blurb) => change(p.id, { blurb })} />
                <label className="price-field"><span>Shown under</span>
                  <select className="select" value={p.group} onChange={(e) => change(p.id, { group: e.target.value })}>
                    {PRODUCT_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
                <label className="price-field"><span>Picture</span>
                  <select className="select" value={p.icon} onChange={(e) => change(p.id, { icon: e.target.value })}>
                    {PRODUCT_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
                <Text label="Counted in" hint="cards, flyers, books…" value={p.unit} maxLength={20} onChange={(unit) => change(p.id, { unit })} />
                <Text label="Working days to make" type="number" min="0" max="60" value={p.days} onChange={(days) => change(p.id, { days })} />
                <label className="switch-row"><span>Show first, as a popular product</span><input type="checkbox" className="switch" checked={!!p.popular} onChange={(e) => change(p.id, { popular: e.target.checked })} /></label>

                <div className="field-label spaced">Sizes <small className="hint inline-hint">in mm</small></div>
                {sizes.map((s, i) => {
                  const setSize = (patch) => change(p.id, { [sizeKey]: sizes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="pe-size">
                      <input className="num" aria-label="Size name" placeholder={sizeText(Number(s.w) || 0, Number(s.h) || 0)} value={s.name} onChange={(e) => setSize({ name: e.target.value, id: '' })} />
                      <input className="num" aria-label="Width in mm" type="number" min="1" value={s.w} onChange={(e) => setSize({ w: e.target.value, id: '' })} />
                      <span aria-hidden>×</span>
                      <input className="num" aria-label="Height in mm" type="number" min="1" value={s.h} onChange={(e) => setSize({ h: e.target.value, id: '' })} />
                      <button type="button" className="ghost-btn" aria-label="Remove size" disabled={sizes.length === 1} onClick={() => change(p.id, { [sizeKey]: sizes.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                  );
                })}
                <button type="button" className="link-btn" onClick={() => change(p.id, { [sizeKey]: [...sizes, { id: '', name: '', w: p.kind === 'area' ? 1000 : 100, h: p.kind === 'area' ? 1000 : 100 }] })}>+ Add a size</button>
                <label className="switch-row"><span>Customers may type their own size</span><input type="checkbox" className="switch" checked={!!p.customSize} onChange={(e) => change(p.id, { customSize: e.target.checked })} /></label>

                <Text label="Quantity buttons" hint="separate with commas" value={p.quantityText ?? p.quantities.join(', ')} onChange={(t) => change(p.id, { quantityText: t, quantities: numbers(t) })} />

                {p.kind === 'area' ? (
                  <>
                    <Pick label="Materials" options={materials} value={p.materials} onChange={(v) => change(p.id, { materials: v })} />
                    <Pick label="Finishing offered" options={Object.keys(FINISHING).map((f) => ({ value: f, label: FINISHING[f].split(' (')[0] }))} value={p.finishing || []} onChange={(v) => change(p.id, { finishing: v, finishingOn: (p.finishingOn || []).filter((f) => v.includes(f)) })} />
                    {(p.finishing || []).length > 0 && <Pick label="Switched on to start" options={(p.finishing || []).map((f) => ({ value: f, label: FINISHING[f].split(' (')[0] }))} value={p.finishingOn || []} onChange={(v) => change(p.id, { finishingOn: v })} />}
                    <label className="switch-row"><span>Comes with a roll-up stand</span><input type="checkbox" className="switch" checked={(p.includes || []).includes('rollupStand')} onChange={(e) => change(p.id, { includes: e.target.checked ? ['rollupStand'] : [] })} /></label>
                  </>
                ) : (
                  <>
                    <Pick label="Papers" options={papers} value={p.papers} onChange={(v) => change(p.id, { papers: v })} />
                    <Pick label="Colour" options={[{ value: 'colour', label: 'Colour' }, { value: 'mono', label: 'Black & white' }]} value={p.colours || ['colour']} onChange={(v) => change(p.id, { colours: v })} />
                    {p.kind !== 'pad' && <Pick label="Lamination" options={[{ value: 'none', label: 'None' }, { value: 'matt', label: 'Matt' }, { value: 'gloss', label: 'Gloss' }]} value={p.laminate || ['none']} onChange={(v) => change(p.id, { laminate: v })} />}
                    {p.kind === 'sheet' && (
                      <>
                        <Pick label="Printed sides" options={[{ value: 1, label: 'One side' }, { value: 2, label: 'Both sides' }]} value={p.sides || [1]} onChange={(v) => change(p.id, { sides: v })} />
                        <label className="price-field"><span>Cutting</span>
                          <select className="select" value={p.cut || 'guillotine'} onChange={(e) => change(p.id, { cut: e.target.value })}>
                            <option value="guillotine">Straight cuts (guillotine)</option>
                            <option value="contour">Around the design (sticker cutter)</option>
                            <option value="none">No cutting</option>
                          </select>
                        </label>
                        <label className="switch-row"><span>Printed on sticker paper</span><input type="checkbox" className="switch" checked={!!p.sticker} onChange={(e) => change(p.id, { sticker: e.target.checked })} /></label>
                        <label className="switch-row"><span>Big quantities may go to the offset press</span><input type="checkbox" className="switch" checked={!!p.offset} onChange={(e) => change(p.id, { offset: e.target.checked })} /></label>
                      </>
                    )}
                    {p.kind === 'booklet' && (
                      <>
                        <div className="pe-size">
                          <span className="hint">Pages from</span>
                          <input className="num" aria-label="Fewest pages" type="number" min="2" value={p.pages.min} onChange={(e) => change(p.id, { pages: { ...p.pages, min: e.target.value } })} />
                          <span className="hint">to</span>
                          <input className="num" aria-label="Most pages" type="number" min="2" value={p.pages.max} onChange={(e) => change(p.id, { pages: { ...p.pages, max: e.target.value } })} />
                        </div>
                        <label className="switch-row"><span>Glued spine (not stapled)</span><input type="checkbox" className="switch" checked={p.binding === 'glue'} onChange={(e) => change(p.id, { binding: e.target.checked ? 'glue' : undefined, pages: { ...p.pages, step: e.target.checked ? 2 : 4 } })} /></label>
                        <label className="switch-row"><span>Thicker cover</span><input type="checkbox" className="switch" checked={p.cover !== false} onChange={(e) => change(p.id, { cover: e.target.checked })} /></label>
                      </>
                    )}
                    {p.kind === 'pad' && (
                      <>
                        <Pick label="Copies of each page" options={[{ value: 1, label: 'Single' }, { value: 2, label: 'Duplicate' }, { value: 3, label: 'Triplicate' }]} value={p.parts} onChange={(v) => change(p.id, { parts: v })} />
                        <Text label="Pages per book" hint="separate with commas" value={p.setsText ?? p.sets.join(', ')} onChange={(t) => change(p.id, { setsText: t, sets: numbers(t) })} />
                      </>
                    )}
                  </>
                )}

                <div className="field-label spaced">Your own prices <small className="hint inline-hint">leave empty to use the price list</small></div>
                <p className="hint">The price for the ★ options at a quantity. Other options add or take off what they cost. Quantities in between are worked out between the two nearest rows.</p>
                {(p.priceTable || []).map((r, i) => {
                  const setRow = (patch) => change(p.id, { priceTable: p.priceTable.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="pe-size pe-price">
                      <input className="num" aria-label="Quantity" type="number" min="1" value={r.qty} onChange={(e) => setRow({ qty: e.target.value })} />
                      <span className="hint">{p.unit} =</span>
                      <input className="num" aria-label="Price" type="number" min="0" step="any" value={r.price} onChange={(e) => setRow({ price: e.target.value })} />
                      <span className="hint">{pl.currency === 'KES' ? 'KSh' : pl.currency}</span>
                      <button type="button" className="ghost-btn" aria-label="Remove price" onClick={() => change(p.id, { priceTable: p.priceTable.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                  );
                })}
                <button type="button" className="link-btn" onClick={() => {
                  const used = (p.priceTable || []).map((r) => Number(r.qty));
                  const next = p.quantities.find((q) => !used.includes(q)) || p.quantities[0];
                  const row = ladder.find((r) => r.quantity === next);
                  change(p.id, { priceTable: [...(p.priceTable || []), { qty: next, price: row ? row.total : 0 }] });
                }}>+ Pin a price</button>
                <Text label="Design fee for this product" hint={`empty = the usual ${formatMoney(pl.design.fee, pl.currency)}`} type="number" min="0" value={p.designFee ?? ''} onChange={(v) => change(p.id, { designFee: v === '' ? undefined : v })} />

                {ladder.length > 0 && (
                  <p className="price-example">
                    Customers see: {ladder.map((r) => `${r.quantity.toLocaleString('en-KE')} = ${r.total > 0 ? formatMoney(r.total, pl.currency) : 'ask'}${r.route === 'offset' ? ' (offset)' : ''}`).join(' · ')}
                  </p>
                )}
                <button type="button" className="danger-link link-btn" onClick={() => { setCatalogue({ ...catalogue, products: catalogue.products.filter((x) => x.id !== p.id) }); setDirty(true); setOpen(null); }}>Delete this product</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <div className="field-label">Add a product</div>
        <div className="pe-picks">
          {KINDS.map((k) => <button key={k.value} type="button" className="group" onClick={() => add(k.value)}>+ {k.label}</button>)}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {done && <p className="ok-text">{done}</p>}
      <div className={`save-bar ${dirty ? 'save-bar-on' : ''}`}>
        <button type="button" className="primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save products' : 'Saved'}</button>
      </div>
    </div>
  );
}
