import { useMemo, useState } from 'react';
import { quotePrice, formatMoney, findPaper, DEFAULT_OPTIONS } from '@engine';
import { api } from '../lib/api.js';
import SendOrder from './SendOrder.jsx';

const LAMINATE = [
  { value: 'none', label: 'None' },
  { value: 'matt', label: 'Matt' },
  { value: 'gloss', label: 'Gloss' },
];

// Paper + finish + live price, then "Send to the shop".
// When the job was opened from an order (ctx.order), the operator instead gets
// "Save print-ready PDF to the order" — no downloading and uploading by hand.
//   spec    = what the job needs (see engine/core/pricing.js)
//   outputs = [{ kind: 'imposed', label, build: async () => ({ bytes, name }) }]
export default function OrderPanel({ ctx, job, tool, title, quantity, recipe, summary, spec, defaultPaper, outputs = [], initial, disabled }) {
  const priceList = ctx.shop.priceList;
  const sticker = !!(spec.groups[0] && spec.groups[0].sticker);
  const fixedPaper = spec.groups.every((g) => g.gsm); // books choose paper by weight in their own card
  const [options, setOptions] = useState(() => ({ ...DEFAULT_OPTIONS, ...((initial && initial.options) || {}) }));
  const paper = findPaper(priceList, { id: options.paper || (sticker ? null : defaultPaper), sticker });
  const used = { ...options, paper: paper ? paper.id : null };
  const quote = useMemo(() => quotePrice(spec, used, priceList), [JSON.stringify(spec), JSON.stringify(used), priceList]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const set = (patch) => setOptions((o) => ({ ...o, ...patch }));
  const papers = priceList.papers.filter((p) => !!p.sticker === sticker);
  const order = ctx.order;

  async function saveToOrder(out) {
    setSaving(out.kind + out.label);
    setError('');
    setSaved('');
    try {
      const { bytes, name } = await out.build();
      const f = new FormData();
      f.append('kind', out.kind);
      f.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
      await api(`/orders/${order.id}/files`, { method: 'POST', auth: true, form: f });
      setSaved(`${out.label[0].toUpperCase()}${out.label.slice(1)} saved to order ${order.code}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="card price-card">
      <div className="field-label">Paper &amp; finish</div>
      {!fixedPaper && (
        <select className="select wide-select" aria-label="Paper" value={used.paper || ''} onChange={(e) => set({ paper: e.target.value })}>
          {papers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
      <div className="price-options">
        <div className="chips chips-2" role="group" aria-label="Colour">
          <button type="button" className={`chip ${options.colour !== false ? 'chip-on' : ''}`} onClick={() => set({ colour: true })}><span>Colour</span></button>
          <button type="button" className={`chip ${options.colour === false ? 'chip-on' : ''}`} onClick={() => set({ colour: false })}><span>Black &amp; white</span></button>
        </div>
        {!sticker && (
          <>
            <div className="field-label spaced">Lamination</div>
            <div className="chips chips-3" role="group" aria-label="Lamination">
              {LAMINATE.map((l) => (
                <button key={l.value} type="button" className={`chip ${options.laminate === l.value ? 'chip-on' : ''}`} onClick={() => set({ laminate: l.value })}><span>{l.label}</span></button>
              ))}
            </div>
          </>
        )}
      </div>

      {quote.total > 0 && (
        <div className="price-box">
          <button type="button" className="price-total" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>{order ? 'Price from the price list' : 'Estimated price'}</span>
            <strong>{formatMoney(quote.total, quote.currency)}</strong>
          </button>
          <div className="hint">
            {quantity > 1 ? `${formatMoney(Math.round((quote.total / quantity) * 100) / 100, quote.currency)} each · ` : ''}
            <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'See how it adds up'}</button>
          </div>
          {open && (
            <ul className="price-lines">
              {quote.lines.map((l, i) => (
                <li key={i}><span>{l.label}<small> · {l.detail}</small></span><span>{formatMoney(l.amount, quote.currency)}</span></li>
              ))}
              {quote.discount > 0 && <li className="price-less"><span>Quantity discount {quote.discountPct}%</span><span>−{formatMoney(quote.discount, quote.currency)}</span></li>}
              {quote.atMinimum && <li><span>Minimum order</span><span>{formatMoney(quote.total, quote.currency)}</span></li>}
            </ul>
          )}
          {quote.example && <p className="hint">Example prices. The shop sets the real ones.</p>}
        </div>
      )}

      {order ? (
        <div className="dialog-actions">
          {outputs.map((out) => (
            <button key={out.kind + out.label} type="button" className="primary" disabled={disabled || !!saving} onClick={() => saveToOrder(out)}>
              {saving === out.kind + out.label ? 'Saving…' : `Save ${out.label} to order ${order.code}`}
            </button>
          ))}
          {saved && <p className="ok-text">{saved} <a className="as-link" href={`#/staff/order/${order.id}`}>Back to the order</a></p>}
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="dialog-actions">
          <SendOrder
            job={job}
            tool={tool}
            title={title}
            quantity={quantity}
            recipe={{ ...recipe, options: used }}
            summary={{ ...summary, paper: paper ? paper.name : null, colour: options.colour !== false, laminate: sticker ? 'none' : options.laminate }}
            priceSpec={spec}
            priceOptions={used}
            quote={quote}
            shop={ctx.shop.shop}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
