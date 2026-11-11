import { useState } from 'react';
import { formatMoney } from '@engine';
import { api, formatWhen } from '../lib/api.js';

const METHODS = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
];

const ENTRY = { charge: 'Price', payment: 'Paid', refund: 'Refund' };

// Price, payments and balance of one order. Every figure comes from the ledger on the server:
// nothing is ever edited or deleted, a mistake is fixed with a new line.
export default function MoneyCard({ order, onChange }) {
  const m = order.money;
  const cur = (order.quote && order.quote.currency) || 'KES';
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [pay, setPay] = useState({ amount: '', method: 'mpesa', reference: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showLines, setShowLines] = useState(false);

  async function act(label, fn) {
    setBusy(label);
    setError('');
    try {
      const r = await fn();
      onChange(r.order);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  const sendPrice = (e) => {
    e.preventDefault();
    act('price', () => api(`/orders/${order.id}/price`, { method: 'PUT', auth: true, json: { amount: Number(price), note: reason } })).then((ok) => ok && (setPrice(''), setReason('')));
  };
  const sendPay = (kind) =>
    act(kind, () => api(`/orders/${order.id}/payments`, { method: 'POST', auth: true, json: { kind, amount: Number(pay.amount), method: pay.method, reference: pay.reference } })).then(
      (ok) => ok && setPay({ amount: '', method: pay.method, reference: '' })
    );

  return (
    <div className="card">
      <div className="field-label">Money</div>
      <div className="money-row">
        <div><span className="hint">Price</span><strong>{formatMoney(m.total, cur)}</strong></div>
        <div><span className="hint">Paid</span><strong>{formatMoney(m.paid, cur)}</strong></div>
        <div className={m.balance > 0 ? 'money-owed' : 'money-clear'}>
          <span className="hint">{m.balance < 0 ? 'Overpaid' : 'Balance'}</span>
          <strong>{formatMoney(Math.abs(m.balance), cur)}</strong>
        </div>
      </div>

      {order.quote && order.quote.lines && (
        <>
          <button type="button" className="link-btn" onClick={() => setShowLines(!showLines)}>
            {showLines ? 'Hide' : 'Show'} how the estimate ({formatMoney(order.quote.total, cur)}) adds up
          </button>
          {showLines && (
            <ul className="price-lines">
              {order.quote.lines.map((l, i) => (
                <li key={i}><span>{l.label}<small> · {l.detail}</small></span><span>{formatMoney(l.amount, cur)}</span></li>
              ))}
              {order.quote.discount > 0 && <li className="price-less"><span>Quantity discount {order.quote.discountPct}%</span><span>−{formatMoney(order.quote.discount, cur)}</span></li>}
            </ul>
          )}
        </>
      )}

      <form className="money-form" onSubmit={(e) => { e.preventDefault(); sendPay('payment'); }}>
        <div className="field-label spaced">Record a payment</div>
        <div className="money-inputs">
          <input className="num" type="number" inputMode="decimal" min="1" step="any" placeholder={m.balance > 0 ? String(m.balance) : 'Amount'} aria-label="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <select className="select" aria-label="How it was paid" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
            {METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
        {pay.method !== 'cash' && (
          <input className="num wide-select spaced-top" placeholder={pay.method === 'mpesa' ? 'M-Pesa code, e.g. TKA1B2C3D4' : 'Reference'} aria-label="Reference" autoCapitalize="characters" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
        )}
        <div className="contact-row">
          <button type="submit" className="primary slim" disabled={!pay.amount || !!busy}>{busy === 'payment' ? 'Saving…' : 'Record payment'}</button>
          {m.paid > 0 && <button type="button" className="ghost-btn" disabled={!pay.amount || !!busy} onClick={() => sendPay('refund')}>Give back (refund)</button>}
        </div>
      </form>

      <form className="money-form" onSubmit={sendPrice}>
        <div className="field-label spaced">Change the price</div>
        <div className="money-inputs">
          <input className="num" type="number" inputMode="decimal" min="0" step="any" placeholder="New total" aria-label="New total price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input className="num" placeholder="Why? (customer sees this)" aria-label="Reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" className="ghost-btn spaced-top" disabled={price === '' || !!busy}>{busy === 'price' ? 'Saving…' : 'Set final price'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {m.entries.length > 0 && (
        <ul className="ledger">
          {m.entries.map((e) => (
            <li key={e.id}>
              <span>
                {ENTRY[e.kind]}{e.method ? ` · ${e.method === 'mpesa' ? 'M-Pesa' : e.method}` : ''}{e.reference ? ` ${e.reference}` : ''}
                <small> · {formatWhen(e.at)}{e.staffName ? ` · ${e.staffName}` : ''}{e.note ? ` · ${e.note}` : ''}</small>
              </span>
              <span>{e.kind === 'refund' || (e.kind === 'charge' && e.amount < 0) ? '−' : ''}{formatMoney(Math.abs(e.amount), cur)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
