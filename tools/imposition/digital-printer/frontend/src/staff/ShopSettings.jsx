import { useEffect, useState } from 'react';
import { quotePrice, formatMoney, fullPriceList } from '@engine';
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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAY = [
  { value: 'none', label: 'Only at the shop (no number shown)' },
  { value: 'till', label: 'M-Pesa Till (Buy Goods)' },
  { value: 'paybill', label: 'M-Pesa Paybill' },
  { value: 'pochi', label: 'Pochi la Biashara' },
  { value: 'phone', label: 'Send Money to a phone number' },
];

// Admin only: the shop's details, how customers pay, the price list, and publishing this
// computer's printers so customers' phones plan on the real machine.
export default function ShopSettings({ onShop }) {
  const [data, setData] = useState(null);
  const [shop, setShop] = useState(null);
  const [pl, setPl] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(null);

  useEffect(() => {
    api('/shop').then((r) => { setData(r); setShop(r.shop); setPl(fullPriceList(r.priceList)); }).catch((e) => setError(e.message));
    api('/local', { auth: true }).then(setLocal).catch(() => {});
  }, []);

  async function save(patch, ok) {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const r = await api('/shop', { method: 'PUT', auth: true, json: patch });
      setData(r);
      setShop(r.shop);
      setPl(fullPriceList(r.priceList));
      store.set('shopCache', r);
      if (onShop) onShop(r);
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
  const setPay = (patch) => setShop({ ...shop, pay: { ...shop.pay, ...patch } });
  const setMaterial = (i, patch) => setPl({ ...pl, largeFormat: { ...pl.largeFormat, materials: pl.largeFormat.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)) } });
  const closed = shop.closedDays || [0];
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
        <label className="price-field"><span>Where customers collect<small> · street, building</small></span><input className="num" maxLength={120} placeholder="Kimathi St, Corner House, 2nd floor" value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} /></label>
        <label className="price-field"><span>Opening hours</span><input className="num" maxLength={80} placeholder="Mon–Sat 8am–6pm" value={shop.hours} onChange={(e) => setShop({ ...shop, hours: e.target.value })} /></label>
        <label className="price-field"><span>KRA PIN<small> · printed on receipts, optional</small></span><input className="num" maxLength={20} value={shop.pin} onChange={(e) => setShop({ ...shop, pin: e.target.value })} /></label>
        <div className="field-label spaced">Closed on <small className="hint inline-hint">ready dates skip these days</small></div>
        <div className="pe-picks">
          {DAYS.map((d, i) => (
            <button key={d} type="button" aria-pressed={closed.includes(i)} className={`group ${closed.includes(i) ? 'group-on' : ''}`} onClick={() => setShop({ ...shop, closedDays: closed.includes(i) ? closed.filter((x) => x !== i) : [...closed, i] })}>{d}</button>
          ))}
        </div>
        <label className="price-field"><span>Days to finish an order made in the tools<small> · products have their own</small></span><input className="num" type="number" min="0" max="60" value={shop.turnaroundDays} onChange={(e) => setShop({ ...shop, turnaroundDays: e.target.value })} /></label>

        <div className="field-label spaced">How customers pay</div>
        <select className="select wide-select" aria-label="How customers pay" value={shop.pay.method} onChange={(e) => setPay({ method: e.target.value })}>
          {PAY.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {shop.pay.method !== 'none' && (
          <>
            <label className="price-field"><span>{shop.pay.method === 'till' ? 'Till number' : shop.pay.method === 'paybill' ? 'Business number' : 'Phone number'}</span><input className="num" inputMode="numeric" value={shop.pay.number} onChange={(e) => setPay({ number: e.target.value })} /></label>
            {shop.pay.method === 'paybill' && <label className="price-field"><span>Account number<small> · empty = the order code</small></span><input className="num" maxLength={20} value={shop.pay.account} onChange={(e) => setPay({ account: e.target.value })} /></label>}
            <label className="price-field"><span>Name M-Pesa shows<small> · so customers know it is you</small></span><input className="num" maxLength={40} value={shop.pay.name} onChange={(e) => setPay({ name: e.target.value })} /></label>
          </>
        )}
        <label className="price-field"><span>Deposit before printing<small> · % of the price, 0 = none</small></span><input className="num" type="number" min="0" max="100" value={shop.pay.depositPct} onChange={(e) => setPay({ depositPct: e.target.value })} /></label>
        <p className="hint">Customers pay on their own phone, then paste the M-Pesa message on their order page. You confirm it on the order after checking your M-Pesa.</p>
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

        <div className="field-label spaced">Large format (per square metre)</div>
        {pl.largeFormat.materials.map((m, i) => (
          <div key={m.id + i} className="paper-row lf-row">
            <input className="num" aria-label="Material name" value={m.name} onChange={(e) => setMaterial(i, { name: e.target.value })} />
            <input className="num" aria-label="Price per square metre" type="number" inputMode="decimal" min="0" step="any" value={m.pricePerSqm} onChange={(e) => setMaterial(i, { pricePerSqm: e.target.value })} />
            <label className="hint"><input className="num" aria-label="Roll width in mm" type="number" min="200" max="6000" value={m.rollWidth} onChange={(e) => setMaterial(i, { rollWidth: e.target.value })} /> mm roll</label>
            <button type="button" className="ghost-btn" aria-label={`Remove ${m.name}`} onClick={() => setPl({ ...pl, largeFormat: { ...pl.largeFormat, materials: pl.largeFormat.materials.filter((_, j) => j !== i) } })}>✕</button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setPl({ ...pl, largeFormat: { ...pl.largeFormat, materials: [...pl.largeFormat.materials, { id: `material${Date.now() % 100000}`, name: '', pricePerSqm: 0, rollWidth: 1520 }] } })}>+ Add a material</button>
        <Price label="Eyelets" hint="each" value={pl.largeFormat.eyelet} onChange={(v) => setGroup('largeFormat', 'eyelet', v)} />
        <Price label="Hemming" hint="per metre of edge" value={pl.largeFormat.hem} onChange={(v) => setGroup('largeFormat', 'hem', v)} />
        <Price label="Pole pockets" hint="per metre" value={pl.largeFormat.pocket} onChange={(v) => setGroup('largeFormat', 'pocket', v)} />
        <Price label="Lamination" hint="per square metre" value={pl.largeFormat.laminate} onChange={(v) => setGroup('largeFormat', 'laminate', v)} />
        <Price label="Roll-up stand and bag" hint="each" value={pl.largeFormat.rollupStand} onChange={(v) => setGroup('largeFormat', 'rollupStand', v)} />
        <Price label="Smallest area charged" hint="square metres per piece" value={pl.largeFormat.minSqm} onChange={(v) => setGroup('largeFormat', 'minSqm', v)} />

        <div className="field-label spaced">Offset press (big runs)</div>
        <label className="switch-row"><span>We take offset jobs (ours or sent out)</span><input type="checkbox" className="switch" checked={!!pl.offset.enabled} onChange={(e) => setGroup('offset', 'enabled', e.target.checked)} /></label>
        {pl.offset.enabled && (
          <>
            <p className="hint">For products marked “may go to the offset press”, the app prices the job both ways and gives the customer the cheaper one.</p>
            <Price label="Press sheet width" hint="mm" value={pl.offset.sheetW} onChange={(v) => setGroup('offset', 'sheetW', v)} />
            <Price label="Press sheet height" hint="mm" value={pl.offset.sheetH} onChange={(v) => setGroup('offset', 'sheetH', v)} />
            <Price label="Gripper" hint="mm that cannot be printed" value={pl.offset.gripper} onChange={(v) => setGroup('offset', 'gripper', v)} />
            <Price label="One plate" hint="4 per side for colour" value={pl.offset.plate} onChange={(v) => setGroup('offset', 'plate', v)} />
            <Price label="Setup (make-ready)" hint="per printed side" value={pl.offset.setup} onChange={(v) => setGroup('offset', 'setup', v)} />
            <Price label="Running" hint="per 1,000 sheets, one side" value={pl.offset.runPer1000} onChange={(v) => setGroup('offset', 'runPer1000', v)} />
            <Price label="Sheets lost setting up" value={pl.offset.wasteSheets} onChange={(v) => setGroup('offset', 'wasteSheets', v)} />
            <Price label="Paper price" hint="% of the digital paper price" value={pl.offset.paperPct} onChange={(v) => setGroup('offset', 'paperPct', v)} />
            <Price label="Smallest offset job" hint="pieces" value={pl.offset.minQuantity} onChange={(v) => setGroup('offset', 'minQuantity', v)} />
            <Price label="Extra working days" value={pl.offset.extraDays} onChange={(v) => setGroup('offset', 'extraDays', v)} />
          </>
        )}

        <div className="field-label spaced">Extras</div>
        <Price label="Design by the shop" hint="per order" value={pl.design.fee} onChange={(v) => setGroup('design', 'fee', v)} />
        <label className="switch-row"><span>Offer express</span><input type="checkbox" className="switch" checked={!!pl.rush.enabled} onChange={(e) => setGroup('rush', 'enabled', e.target.checked)} /></label>
        {pl.rush.enabled && (
          <>
            <Price label="Express costs" hint="% more" value={pl.rush.pct} onChange={(v) => setGroup('rush', 'pct', v)} />
            <Price label="Express is ready in" hint="working days, 0 = same day" value={pl.rush.days} onChange={(v) => setGroup('rush', 'days', v)} />
          </>
        )}
        <label className="switch-row"><span>Offer delivery</span><input type="checkbox" className="switch" checked={!!pl.delivery.enabled} onChange={(e) => setGroup('delivery', 'enabled', e.target.checked)} /></label>
        {pl.delivery.enabled && (
          <>
            <Price label="Delivery fee" value={pl.delivery.fee} onChange={(v) => setGroup('delivery', 'fee', v)} />
            <label className="price-field"><span>Where you deliver</span><input className="num" maxLength={80} value={pl.delivery.note} onChange={(e) => setGroup('delivery', 'note', e.target.value)} /></label>
          </>
        )}

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

      {local && (
        <div className="card">
          <div className="field-label">Open PrintHub on a phone</div>
          {local.addresses.length ? (
            <>
              <p className="hint">On a phone joined to the same Wi-Fi as this computer, type this address in the browser:</p>
              {local.addresses.map((a) => <p key={a} className="order-code small">{local.appBuilt ? a : a.replace(/:\d+$/, ':5180')}</p>)}
              <p className="hint">If the phone cannot open it, Windows Firewall is blocking it: allow “Node.js” on private networks.</p>
            </>
          ) : (
            <p className="hint">This computer is not on a network right now.</p>
          )}
          <p className="hint">Data is kept in {local.database === 'postgres' ? 'your PostgreSQL database' : 'the built-in database (the folder server/data). Back that folder up.'}</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {done && <p className="ok-text">{done}</p>}
    </div>
  );
}
