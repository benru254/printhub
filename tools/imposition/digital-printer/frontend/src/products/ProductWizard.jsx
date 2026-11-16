import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cleanChoice, priceProduct, priceLadder, pricingContext, depositFor, checkArtwork, readPdfGeometry, formatMoney,
  readyDate, findMaterial, FINISHING,
} from '@engine';
import { api, staffToken } from '../lib/api.js';
import { loadFiles } from '../lib/loadFiles.js';
import { customer, rememberOrder } from '../lib/customer.js';
import { dayText, unitText } from '../lib/days.js';
import ProductIcon from './ProductIcon.jsx';
import QuantityPicker from './QuantityPicker.jsx';
import ArtworkPicker from './ArtworkPicker.jsx';
import OrderDone from './OrderDone.jsx';
import { Choice, SizePicker } from './wizardParts.jsx';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
const PARTS = { 1: 'Single sheets', 2: 'Duplicate (2 copies)', 3: 'Triplicate (3 copies)' };

// ORDERING A PRODUCT, on one screen: size, how many (with prices), a few options, the
// design, when, and who. The price at the bottom is worked out by the same code the
// server charges with. Staff use the same screen for a customer at the counter.
//   shop = useShop() result      start = { choice } to begin from (order again)
export default function ProductWizard({ product, shop, start, onBack, onHome }) {
  const counter = !!staffToken.get(); // staff typing in a walk-in or WhatsApp order
  const ctx = useMemo(() => pricingContext(shop), [shop.priceList, shop.printers, shop.customSheets]); // eslint-disable-line react-hooks/exhaustive-deps
  const pl = ctx.priceList;
  const currency = pl.currency || 'KES';

  const [choice, setChoice] = useState(() => cleanChoice(product, (start && start.choice) || {}));
  const [artwork, setArtwork] = useState('upload');
  const [file, setFile] = useState(null); // { loaded, geometry, thumb, name, pages }
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [speed, setSpeed] = useState('standard');
  const [delivery, setDelivery] = useState('collect');
  const [address, setAddress] = useState('');
  const [who, setWho] = useState(() => (counter ? { name: '', phone: '' } : customer.get()));
  const [notes, setNotes] = useState('');
  const [matches, setMatches] = useState([]); // counter: customers the shop already knows
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null); // { where, text }
  const [sent, setSent] = useState(null);
  const key = useRef(newKey()); // one key per order: a double tap never makes two
  const refs = { design: useRef(null), who: useRef(null), deliver: useRef(null) };

  const set = (patch) => setChoice((c) => cleanChoice(product, { ...c, ...patch }));
  const extras = { artwork, speed, delivery };
  const quote = useMemo(() => priceProduct(product, choice, ctx, extras), [product, choice, ctx, artwork, speed, delivery]); // eslint-disable-line react-hooks/exhaustive-deps
  const ladder = useMemo(() => priceLadder(product, choice, ctx), [product, choice, ctx]);
  const check = useMemo(
    () => (file && artwork === 'upload' ? checkArtwork({ product, choice, geometry: file.geometry, imageInfo: file.loaded.imageInfo }) : null),
    [file, artwork, product, choice]
  );
  const deposit = depositFor(quote.total, shop.shop.pay && shop.shop.pay.depositPct, pl);
  const closed = shop.shop.closedDays;
  const designFee = product.designFee !== undefined ? product.designFee : pl.design.fee;

  // Counter: as staff type the name or number, offer the customers the shop already has.
  useEffect(() => {
    if (!counter) return undefined;
    const q = who.phone.replace(/\D/g, '').length >= 4 ? who.phone.replace(/\D/g, '').replace(/^0/, '') : who.name.trim().length >= 3 ? who.name.trim() : '';
    if (!q) {
      setMatches([]);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(() => {
      api(`/customers?q=${encodeURIComponent(q)}&limit=4`, { auth: true })
        .then((r) => alive && setMatches(r.customers.filter((c) => c.name !== who.name || !c.phone.endsWith(who.phone.replace(/\D/g, '').replace(/^0/, '')))))
        .catch(() => {});
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [counter, who.name, who.phone]);

  async function pick(files) {
    setFileBusy(true);
    setFileError('');
    try {
      const loaded = await loadFiles(files);
      const geometry = await readPdfGeometry(loaded.bytes);
      // A small picture of page 1, so the customer sees they picked the right file.
      let thumb = null;
      try {
        const { openPdf } = await import('../lib/pdfRender.js');
        const pdf = await openPdf(loaded.bytes);
        const r = await pdf.render(0, 600);
        thumb = r.canvas.toDataURL('image/jpeg', 0.8);
        pdf.destroy();
      } catch {
        // no preview: the file is still fine to send
      }
      setFile({ loaded, geometry, thumb, name: loaded.name, pages: geometry.pageCount });
      setProblem(null);
      // What the file tells us: a front and a back, or how many pages the booklet has.
      const found = checkArtwork({ product, choice, geometry, imageInfo: loaded.imageInfo }).suggest;
      if (artwork === 'upload' && (found.sides || found.pages)) set(found);
    } catch (e) {
      setFileError(e.message || 'This file could not be read.');
    } finally {
      setFileBusy(false);
    }
  }

  function missing() {
    if (artwork === 'upload' && !file) return { where: 'design', text: 'Add your design, or choose “Design it for me” or “I’ll send it later”.' };
    if (delivery === 'deliver' && address.trim().length < 3) return { where: 'deliver', text: 'Tell us where to deliver it.' };
    if (who.name.trim().length < 2) return { where: 'who', text: counter ? 'Enter the customer’s name.' : 'Enter your name.' };
    if (who.phone.replace(/\D/g, '').length < 9) return { where: 'who', text: counter ? 'Enter the customer’s phone number.' : 'Enter your phone number, e.g. 0712 345 678.' };
    return null;
  }

  async function send() {
    const m = missing();
    setProblem(m);
    if (m) {
      const el = refs[m.where].current;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSending(true);
    try {
      const f = new FormData();
      f.append('name', who.name);
      f.append('phone', who.phone);
      f.append('notes', notes);
      f.append('product', JSON.stringify({ id: product.id, choice, speed }));
      f.append('artwork', artwork);
      f.append('delivery', delivery);
      f.append('address', address);
      f.append('clientKey', key.current);
      if (file && artwork !== 'later') f.append('file', new Blob([file.loaded.bytes], { type: 'application/pdf' }), `${file.name}.pdf`);
      const r = await api('/orders', { method: 'POST', form: f, auth: counter });
      if (!counter) {
        customer.set(who);
        rememberOrder(r, product.name);
      }
      key.current = newKey();
      setSent(r);
      window.scrollTo(0, 0);
    } catch (e) {
      setProblem({ where: 'send', text: e.message });
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return <OrderDone sent={sent} product={product} quantity={choice.quantity} artwork={artwork} delivery={delivery} shop={shop} counter={counter} onHome={onHome} />;
  }

  const paperName = (id) => (pl.papers.find((p) => p.id === id) || { name: id }).name;
  const standardDay = dayText(readyDate(new Date(), quote.standardDays ?? quote.days, closed));
  const expressDay = quote.express.offered ? dayText(readyDate(new Date(), quote.express.days, closed)) : '';
  const hasOptions = product.kind !== 'area'
    ? product.papers.length > 1 || (product.sides || []).length > 1 || (product.colours || []).length > 1 || (product.laminate || []).length > 1 || product.kind !== 'sheet'
    : product.materials.length > 1 || (product.finishing || []).length > 0;

  return (
    <main className="start wizard">
      <button type="button" className="back-btn" onClick={onBack}>‹ All products</button>
      <div className="wizard-head">
        <ProductIcon id={product.icon} className="product-icon big" />
        <div>
          <h1 className="wizard-title">{product.name}</h1>
          <p className="hint">{product.blurb}</p>
        </div>
      </div>
      {counter && <p className="note-warn">Counter order: you are entering this for a customer. It goes straight into the order list.</p>}

      <section className="card">
        <h2 className="step-title">Size</h2>
        <SizePicker product={product} choice={choice} onChange={set} />
      </section>

      <section className="card">
        <h2 className="step-title">How many {product.unit}?</h2>
        <QuantityPicker product={product} ladder={ladder} value={choice.quantity} onChange={(quantity) => set({ quantity })} currency={currency} />
        {quote.route === 'offset' && <p className="hint">Big runs are printed on our offset press: a much lower price each, {pl.offset.extraDays} more working days.</p>}
      </section>

      {hasOptions && (
        <section className="card">
          <h2 className="step-title">Options</h2>
          {product.kind === 'area' ? (
            <>
              {product.materials.length > 1 && (
                <>
                  <div className="field-label">Material</div>
                  <Choice label="Material" columns={2} value={choice.material} onChange={(material) => set({ material })}
                    options={product.materials.map((id) => ({ value: id, label: (findMaterial(pl, id) || { name: id }).name }))} />
                </>
              )}
              {(product.finishing || []).map((f) => (
                <label key={f} className="switch-row">
                  <span>{FINISHING[f]}</span>
                  <input type="checkbox" className="switch" checked={!!choice.finish[f]} onChange={(e) => set({ finish: { ...choice.finish, [f]: e.target.checked } })} />
                </label>
              ))}
            </>
          ) : (
            <>
              {product.kind === 'booklet' && (
                <>
                  <label className="field-label" htmlFor="wz-pages">Number of pages</label>
                  <input id="wz-pages" className="num num-big" type="number" inputMode="numeric" min={product.pages.min} max={product.pages.max} step={product.pages.step} value={choice.pages}
                    onChange={(e) => setChoice((c) => ({ ...c, pages: e.target.value }))} onBlur={() => set({})} />
                  <p className="hint">{file ? 'Taken from your file.' : `Between ${product.pages.min} and ${product.pages.max}. Count every side that has something on it, the cover too.`}</p>
                </>
              )}
              {product.kind === 'pad' && (
                <>
                  <div className="field-label">Copies of each page</div>
                  <Choice label="Copies of each page" columns={1} value={choice.parts} onChange={(parts) => set({ parts })} options={product.parts.map((n) => ({ value: n, label: PARTS[n] }))} />
                  <div className="field-label spaced">Pages in each book</div>
                  <Choice label="Pages in each book" value={choice.sets} onChange={(sets) => set({ sets })} options={product.sets.map((n) => ({ value: n, label: String(n) }))} />
                  <label className="field-label spaced" htmlFor="wz-from">Numbers start at</label>
                  <input id="wz-from" className="num" type="number" inputMode="numeric" min="0" value={choice.numberFrom}
                    onChange={(e) => setChoice((c) => ({ ...c, numberFrom: e.target.value }))} onBlur={() => set({})} />
                  <p className="hint">This order: No. {quote.choice.numberFrom} to {quote.choice.numberFrom + choice.quantity * choice.sets - 1}. When you order again we carry on from there.</p>
                </>
              )}
              {product.papers.length > 1 && (
                <>
                  <div className="field-label spaced">Paper</div>
                  <Choice label="Paper" columns={1} value={choice.paper} onChange={(paper) => set({ paper })} options={product.papers.map((id) => ({ value: id, label: paperName(id) }))} />
                </>
              )}
              {(product.sides || []).length > 1 && (
                <>
                  <div className="field-label spaced">Printed on</div>
                  <Choice label="Printed sides" columns={2} value={choice.sides} onChange={(sides) => set({ sides })}
                    options={[{ value: 1, label: 'One side' }, { value: 2, label: 'Both sides' }].filter((o) => product.sides.includes(o.value))} />
                </>
              )}
              {(product.colours || []).length > 1 && (
                <>
                  <div className="field-label spaced">Colour</div>
                  <Choice label="Colour" columns={2} value={choice.colour} onChange={(colour) => set({ colour })} options={[{ value: true, label: 'Colour' }, { value: false, label: 'Black & white' }]} />
                </>
              )}
              {(product.laminate || []).length > 1 && (
                <>
                  <div className="field-label spaced">Lamination <small className="hint inline-hint">a thin film that protects and feels smooth</small></div>
                  <Choice label="Lamination" value={choice.laminate} onChange={(laminate) => set({ laminate })}
                    options={product.laminate.map((l) => ({ value: l, label: l === 'none' ? 'None' : l === 'matt' ? 'Matt' : 'Gloss' }))} />
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="card" ref={refs.design}>
        <h2 className="step-title">Your design</h2>
        <ArtworkPicker
          artwork={artwork}
          onArtwork={(a) => { setArtwork(a); setProblem(null); }}
          file={file}
          check={check}
          busy={fileBusy}
          error={fileError}
          onFiles={pick}
          onRemove={() => setFile(null)}
          designFee={designFee}
          currency={currency}
        />
        {problem && problem.where === 'design' && <p className="error">{problem.text}</p>}
      </section>

      <section className="card" ref={refs.deliver}>
        <h2 className="step-title">When and where</h2>
        <div className="art-options two" role="radiogroup" aria-label="How fast">
          <button type="button" role="radio" aria-checked={speed === 'standard' || !quote.express.offered} className={`art-option ${speed === 'standard' || !quote.express.offered ? 'art-on' : ''}`} onClick={() => setSpeed('standard')}>
            <span className="art-title">Ready {standardDay}</span>
            <span className="art-sub">normal price</span>
          </button>
          {quote.express.offered && (
            <button type="button" role="radio" aria-checked={speed === 'express'} className={`art-option ${speed === 'express' ? 'art-on' : ''}`} onClick={() => setSpeed('express')}>
              <span className="art-title">Express: {expressDay}</span>
              <span className="art-sub">+ {formatMoney(quote.express.amount, currency)}</span>
            </button>
          )}
        </div>
        {pl.delivery.enabled && (
          <>
            <div className="art-options two spaced" role="radiogroup" aria-label="Collect or deliver">
              <button type="button" role="radio" aria-checked={delivery === 'collect'} className={`art-option ${delivery === 'collect' ? 'art-on' : ''}`} onClick={() => setDelivery('collect')}>
                <span className="art-title">I’ll collect</span>
                <span className="art-sub">{shop.shop.address || 'at the shop'}</span>
              </button>
              <button type="button" role="radio" aria-checked={delivery === 'deliver'} className={`art-option ${delivery === 'deliver' ? 'art-on' : ''}`} onClick={() => setDelivery('deliver')}>
                <span className="art-title">Deliver to me</span>
                <span className="art-sub">+ {formatMoney(pl.delivery.fee, currency)}{pl.delivery.note ? ` · ${pl.delivery.note}` : ''}</span>
              </button>
            </div>
            {delivery === 'deliver' && (
              <>
                <label className="field-label spaced" htmlFor="wz-address">Where to?</label>
                <input id="wz-address" className="num wide-select" placeholder="Building, street, a landmark" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
                {problem && problem.where === 'deliver' && <p className="error">{problem.text}</p>}
              </>
            )}
          </>
        )}
      </section>

      <section className="card" ref={refs.who}>
        <h2 className="step-title">{counter ? 'The customer' : 'Your details'}</h2>
        <label className="field-label" htmlFor="wz-name">{counter ? 'Customer’s name' : 'Your name'}</label>
        <input id="wz-name" className="num wide-select" autoComplete={counter ? 'off' : 'name'} value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} />
        <label className="field-label spaced" htmlFor="wz-phone">Phone number</label>
        <input id="wz-phone" className="num wide-select" type="tel" inputMode="tel" autoComplete={counter ? 'off' : 'tel'} placeholder="0712 345 678" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} />
        {!counter && <p className="hint">No password. We use your number to tell you when the proof and the order are ready.</p>}
        {matches.length > 0 && (
          <div className="my-orders">
            {matches.map((c) => (
              <button key={c.id} type="button" className="chip" onClick={() => { setWho({ name: c.name, phone: c.phone }); setMatches([]); }}>
                <span>{c.name} · {c.phone}</span>
                <small>{c.orders} {c.orders === 1 ? 'order' : 'orders'}{c.owes > 0 ? ` · owes ${formatMoney(c.owes, currency)}` : ''}</small>
              </button>
            ))}
          </div>
        )}
        {problem && problem.where === 'who' && <p className="error">{problem.text}</p>}
        <label className="field-label spaced" htmlFor="wz-notes">Anything we should know? <small className="hint inline-hint">optional</small></label>
        <textarea id="wz-notes" className="num wide-select text-area" rows={3} maxLength={2000}
          placeholder={artwork === 'design' ? 'What should be on it? Names, numbers, colours…' : 'e.g. call me before printing'} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {quote.total > 0 && (
        <details className="card sum-card">
          <summary>How the price adds up</summary>
          <ul className="price-lines">
            {[...quote.lines, ...quote.extras].map((l, i) => (
              <li key={i}><span>{l.label}{l.detail ? <small> · {l.detail}</small> : null}</span><span>{formatMoney(l.amount, currency)}</span></li>
            ))}
            {quote.discount > 0 && <li className="price-less"><span>Quantity discount {quote.discountPct}%</span><span>−{formatMoney(quote.discount, currency)}</span></li>}
            {quote.atMinimum && <li><span>Smallest order</span><span>{formatMoney(quote.production, currency)}</span></li>}
          </ul>
          {quote.example && <p className="hint">Example prices. The shop sets the real ones.</p>}
        </details>
      )}

      {problem && problem.where === 'send' && <p className="error">{problem.text}</p>}

      <div className="order-bar">
        <div className="order-bar-in">
          <div className="order-bar-price">
            <span className="hint">{choice.quantity.toLocaleString('en-KE')} {unitText(product.unit, choice.quantity)}</span>
            <strong>{quote.total > 0 ? formatMoney(quote.total, currency) : 'Price from the shop'}</strong>
            {deposit > 0 && deposit < quote.total && <span className="hint">{formatMoney(deposit, currency)} deposit to start</span>}
          </div>
          <button type="button" className="primary slim" onClick={send} disabled={sending || fileBusy}>{sending ? 'Sending…' : counter ? 'Save order' : 'Send order'}</button>
        </div>
      </div>
    </main>
  );
}
