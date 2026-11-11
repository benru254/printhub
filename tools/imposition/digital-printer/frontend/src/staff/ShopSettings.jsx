import { useEffect, useState } from 'react';
import { quotePrice, formatMoney } from '@engine';
import { api } from '../lib/api.js';
import { store } from '../lib/storage.js';
import { loadPrinters } from '../lib/printers.js';

// A worked example, so the owner sees what a change does before saving.
const EXAMPLE = { groups: [{ label: 'Printing', sheets: 5, sheetW: 320, sheetH: 450, sides: 2 }], cut: 'guillotine' };

function Price({ label, hint, value, onChange }) {
  return (
    <label className="price-field">
      <span>{label}{hint && <small> · {hint}</small>}</span>
      <input className="num" type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// Admin only: shop name and WhatsApp, the price list, and publishing this computer's printers
// so customers' phones plan on the real machine.
export default function ShopSettings() {
  const [data, setData] = useState(null);
  const [shop, setShop] = useState(null);
  const [pl, setPl] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/shop').then((r) => { setData(r); setShop(r.shop); setPl(r.priceList); }).catch((e) => setError(e.message));
  }, []);

  async function save(patch, ok) {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const r = await api('/shop', { method: 'PUT', auth: true, json: patch });
      setData(r);
      setShop(r.shop);
      setPl(r.priceList);
      store.set('shopCache', r);
      setDone(ok);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!pl) return error ? <p className="error">{error}</p> : <p className="hint">Loading…</p>;

  const setGroup = (group, key, v) => setPl({ ...pl, [group]: { ...pl[group], [key]: v } });
  const setPaper = (i, patch) => setPl({ ...pl, papers: pl.papers.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setTier = (i, patch) => setPl({ ...pl, discounts: pl.discounts.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const example = quotePrice(EXAMPLE, { paper: 'card300', colour: true, laminate: 'none' }, pl);
  const customSheets = store.get('customSheets', []);
  const printers = loadPrinters(customSheets);

  return (
    <div className="staff-list">
      <form className="card" onSubmit={(e) => { e.preventDefault(); save({ shop }, 'Shop details saved.'); }}>
        <div className="field-label">Your shop</div>
        <label className="price-field"><span>Shop name</span><input className="num" required value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} /></label>
        <label className="price-field"><span>WhatsApp number<small> · customers get a “message the shop” button</small></span><input className="num" type="tel" placeholder="0712 345 678" value={shop.whatsapp} onChange={(e) => setShop({ ...shop, whatsapp: e.target.value })} /></label>
        <label className="price-field"><span>Usual days to finish a job</span><input className="num" type="number" min="0" max="60" value={shop.turnaroundDays} onChange={(e) => setShop({ ...shop, turnaroundDays: e.target.value })} /></label>
        <button type="submit" className="primary slim spaced-top" disabled={busy}>Save shop details</button>
      </form>

      <form className="card" onSubmit={(e) => { e.preventDefault(); save({ priceList: pl }, 'Prices saved. Customers see them straight away.'); }}>
        <div className="field-label">Price list ({pl.currency})</div>
        {pl.example && <p className="note-warn">These are EXAMPLE prices. Put in your own and save — customers are being quoted from this list.</p>}
        <p className="hint">All prices are what the customer pays, for one A3 sheet. SRA3 is charged a little more and A4 half, by size.</p>

        <div className="field-label spaced">Paper (per A3 sheet)</div>
        {pl.papers.map((p, i) => (
          <div key={p.id + i} className="paper-row">
            <input className="num" aria-label="Paper name" value={p.name} onChange={(e) => setPaper(i, { name: e.target.value })} />
            <input className="num" aria-label="Price" type="number" inputMode="decimal" min="0" step="any" value={p.priceA3} onChange={(e) => setPaper(i, { priceA3: e.target.value })} />
            <button type="button" className="ghost-btn" aria-label={`Remove ${p.name}`} onClick={() => setPl({ ...pl, papers: pl.papers.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setPl({ ...pl, papers: [...pl.papers, { id: `paper${Date.now() % 100000}`, name: '', gsm: 0, priceA3: 0 }] })}>+ Add a paper</button>

        <div className="field-label spaced">Printing (per printed side)</div>
        <Price label="Colour" value={pl.print.colour} onChange={(v) => setGroup('print', 'colour', v)} />
        <Price label="Black & white" value={pl.print.mono} onChange={(v) => setGroup('print', 'mono', v)} />

        <div className="field-label spaced">Finishing</div>
        <Price label="Matt lamination" hint="per side" value={pl.laminate.matt} onChange={(v) => setGroup('laminate', 'matt', v)} />
        <Price label="Gloss lamination" hint="per side" value={pl.laminate.gloss} onChange={(v) => setGroup('laminate', 'gloss', v)} />
        <Price label="Cutting" hint="per job" value={pl.cutting.perJob} onChange={(v) => setGroup('cutting', 'perJob', v)} />
        <Price label="Cutting" hint="extra per sheet" value={pl.cutting.perSheet} onChange={(v) => setGroup('cutting', 'perSheet', v)} />
        <Price label="Cut around design (stickers)" hint="per sheet" value={pl.contourCut.perSheet} onChange={(v) => setGroup('contourCut', 'perSheet', v)} />
        <Price label="Stapled booklet" hint="per book" value={pl.binding.staple} onChange={(v) => setGroup('binding', 'staple', v)} />
        <Price label="Glued book" hint="per book" value={pl.binding.glue} onChange={(v) => setGroup('binding', 'glue', v)} />
        <Price label="Receipt book padding" hint="per book" value={pl.binding.pad} onChange={(v) => setGroup('binding', 'pad', v)} />

        <div className="field-label spaced">Quantity discounts (on paper and printing)</div>
        {pl.discounts.map((t, i) => (
          <div key={i} className="paper-row">
            <label className="hint">From <input className="num" aria-label="Sheets" type="number" min="1" value={t.sheets} onChange={(e) => setTier(i, { sheets: e.target.value })} /> sheets</label>
            <label className="hint"><input className="num" aria-label="Percent off" type="number" min="0" max="90" value={t.pct} onChange={(e) => setTier(i, { pct: e.target.value })} /> % off</label>
            <button type="button" className="ghost-btn" aria-label="Remove discount" onClick={() => setPl({ ...pl, discounts: pl.discounts.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setPl({ ...pl, discounts: [...pl.discounts, { sheets: 100, pct: 5 }] })}>+ Add a discount step</button>

        <div className="field-label spaced">Rules</div>
        <Price label="Smallest order" value={pl.minOrder} onChange={(v) => setPl({ ...pl, minOrder: v })} />
        <Price label="Round prices up to the nearest" value={pl.roundTo} onChange={(v) => setPl({ ...pl, roundTo: v })} />

        <p className="price-example">
          With these prices, <strong>100 business cards, both sides, 300 gsm</strong> (5 SRA3 sheets) cost the customer <strong>{formatMoney(example.total, pl.currency)}</strong>.
        </p>
        <button type="submit" className="primary slim" disabled={busy}>{busy ? 'Saving…' : 'Save prices'}</button>
      </form>

      <div className="card">
        <div className="field-label">Printers customers plan on</div>
        <p className="hint">
          {data.printers.length
            ? `Customers' phones use: ${data.printers.map((p) => p.name).join(', ')}.`
            : 'Not published yet: customers’ phones are guessing your printer’s margins.'}
        </p>
        <p className="hint">This computer has: {printers.map((p) => p.name).join(', ')}. Set them up under the printer button (top right), then publish.</p>
        <button type="button" className="ghost-btn spaced-top" disabled={busy} onClick={() => save({ printers: { printers, customSheets } }, 'Printers published to customers.')}>
          Publish this computer’s printers to customers
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {done && <p className="ok-text">{done}</p>}
    </div>
  );
}
