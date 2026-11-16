import { useState } from 'react';
import { formatMoney, parseMpesa } from '@engine';
import { api } from '../lib/api.js';
import { accessBody } from '../lib/customer.js';
import { copyText } from '../lib/copy.js';

// The words on the M-Pesa menu for each way of paying.
const HOW = {
  till: { menu: 'Lipa na M-PESA → Buy Goods and Services', label: 'Till number' },
  paybill: { menu: 'Lipa na M-PESA → Pay Bill', label: 'Business number' },
  pochi: { menu: 'Lipa na M-PESA → Pochi la Biashara', label: 'Phone number' },
  phone: { menu: 'Send Money', label: 'Phone number' },
};

// How to pay, and "I have paid". The customer pays with M-Pesa on their own phone, then
// pastes the message here; the shop confirms it. (Nothing is charged by this app.)
//   money  = { total, paid, balance, depositDue }     claims = what they already told us
//   access = { key } or { phone }: how this phone proves the order is theirs
export default function PayBox({ shop, code, access, money, currency = 'KES', claims = [], onOrder }) {
  const pay = (shop && shop.pay) || { method: 'none' };
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!(money.balance > 0)) {
    return money.total > 0 ? <p className="ok-text">Fully paid. Thank you!</p> : null;
  }
  const deposit = money.depositDue > 0 && money.depositDue < money.balance ? money.depositDue : 0;
  const waiting = claims.filter((c) => c.status === 'pending');
  const how = HOW[pay.method];
  const read = parseMpesa(text);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(`/orders/track/${encodeURIComponent(code)}/paid`, { method: 'POST', json: { ...accessBody(access), text } });
      setText('');
      setOpen(false);
      if (onOrder) onOrder(r.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pay-box">
      <div className="pay-amount">
        <span>{deposit ? 'Pay the deposit to start' : 'To pay'}</span>
        <strong>{formatMoney(deposit || money.balance, currency)}</strong>
      </div>
      {deposit > 0 && <p className="hint">The rest ({formatMoney(money.balance - deposit, currency)}) when you collect. Or pay all {formatMoney(money.balance, currency)} now.</p>}

      {how ? (
        <ol className="pay-steps">
          <li>On your phone open <strong>M-PESA</strong> → {how.menu}</li>
          <li>
            {how.label}{' '}
            <button
              type="button"
              className="pay-number"
              onClick={async () => {
                setCopied(await copyText(pay.number));
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label={`Copy ${how.label} ${pay.number}`}
            >
              {pay.number} <small>{copied ? 'copied ✓' : 'tap to copy'}</small>
            </button>
            {pay.method === 'paybill' && <> · Account <strong>{pay.account || code}</strong></>}
          </li>
          <li>Amount <strong>{formatMoney(deposit || money.balance, currency)}</strong>{pay.name ? <> · check the name is <strong>{pay.name}</strong></> : null}</li>
        </ol>
      ) : (
        <p className="hint">Pay at the shop (cash or M-Pesa) when you collect, or ask the shop how to pay.</p>
      )}

      {waiting.map((c) => (
        <p key={c.reference} className="pay-wait">We are checking your payment <strong>{c.reference}</strong>{c.amount ? ` (${formatMoney(c.amount, currency)})` : ''}. You will see it here once confirmed.</p>
      ))}

      {how && !open && (
        <button type="button" className="ghost-btn wide-btn" onClick={() => setOpen(true)}>I have paid</button>
      )}
      {open && (
        <form onSubmit={send}>
          <label className="field-label spaced" htmlFor="pay-text">Paste the M-Pesa message here</label>
          <textarea id="pay-text" className="num wide-select text-area" rows={3} placeholder="e.g. TKA1B2C3D4 Confirmed. Ksh500.00 sent to…  (or type just the code)" value={text} onChange={(e) => setText(e.target.value)} />
          {text.trim() && (
            <p className={read.code ? 'ok-text' : 'hint'}>
              {read.code ? `Code ${read.code}${read.amount ? ` · ${formatMoney(read.amount, currency)}` : ''}` : 'We cannot see an M-Pesa code in that yet.'}
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="contact-row">
            <button type="submit" className="primary slim" disabled={busy || !read.code}>{busy ? 'Sending…' : 'Tell the shop'}</button>
            <button type="button" className="ghost-btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
