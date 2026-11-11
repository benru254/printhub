import { useRef, useState } from 'react';
import { formatMoney } from '@engine';
import { api } from '../lib/api.js';
import { store } from '../lib/storage.js';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

function dayText(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Send to the shop": the customer's file + the settings they chose go to the operator.
// No password: name + phone. The phone (with the order code) is how they track the order.
//   recipe  = the tool settings, so the operator opens the job exactly as the customer set it
//   summary = a few plain facts for the order list (size, sheets, pieces per sheet)
//   priceSpec + priceOptions = what the server prices the order from (the price shown here is the same sum)
export default function SendOrder({ job, tool, title, quantity, recipe, summary, priceSpec, priceOptions, quote, shop, disabled }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({ ...store.get('customer', { name: '', phone: '' }), notes: '', due: dayText((shop && shop.turnaroundDays) ?? 2) }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  // One key per order: a double tap or a retry on bad network can never make two orders.
  const key = useRef(newKey());

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function send(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const f = new FormData();
      f.append('name', form.name);
      f.append('phone', form.phone);
      f.append('notes', form.notes);
      f.append('tool', tool);
      f.append('title', title);
      f.append('quantity', String(quantity));
      f.append('recipe', JSON.stringify(recipe));
      f.append('summary', JSON.stringify(summary));
      if (priceSpec) f.append('priceSpec', JSON.stringify(priceSpec));
      if (priceOptions) f.append('priceOptions', JSON.stringify(priceOptions));
      if (form.due) f.append('dueAt', `${form.due}T17:00:00`);
      f.append('clientKey', key.current);
      f.append('file', new Blob([job.bytes], { type: 'application/pdf' }), `${job.name}.pdf`);
      const r = await api('/orders', { method: 'POST', form: f });
      store.set('customer', { name: form.name.trim(), phone: form.phone.trim() });
      const mine = store.get('myOrders', []);
      if (!mine.some((o) => o.code === r.code)) store.set('myOrders', [{ code: r.code, title, at: new Date().toISOString() }, ...mine].slice(0, 20));
      key.current = newKey();
      setSent(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)} disabled={disabled}>
        Send to the shop to print{quote && quote.total ? ` · ${formatMoney(quote.total, quote.currency)}` : ''}
      </button>
    );
  }

  const trackUrl = sent ? `${window.location.origin}${window.location.pathname}#/track/${sent.code}` : '';
  const shopName = (shop && shop.name) || 'the shop';

  return (
    <div className="dialog-back" role="dialog" aria-modal="true" aria-labelledby="send-title">
      <div className="dialog">
        {sent ? (
          <>
            <h2 id="send-title" className="dialog-title">Order sent ✓</h2>
            <p className="dialog-text">Your order code is</p>
            <p className="order-code">{sent.code}</p>
            {sent.estimate && (
              <p className="dialog-text">
                Estimated price: <strong>{formatMoney(sent.estimate.total, sent.estimate.currency)}</strong>. {shopName} confirms the final price after checking your file.
              </p>
            )}
            <p className="hint">Keep this code. The shop will contact you on {form.phone}.</p>
            <div className="dialog-actions">
              <a className="primary as-link" href={`#/track/${sent.code}`}>Track my order</a>
              {shop && shop.whatsapp && (
                <a
                  className="ghost-btn wide-btn as-btn-link"
                  href={`https://wa.me/${shop.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I have sent order ${sent.code} (${title}, ${quantity}). `)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Message {shopName} on WhatsApp
                </a>
              )}
              <a
                className="ghost-btn wide-btn as-btn-link"
                href={`https://wa.me/?text=${encodeURIComponent(`My print order ${sent.code}: ${trackUrl}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Save the tracking link to my WhatsApp
              </a>
              <button type="button" className="ghost-btn wide-btn" onClick={() => { setOpen(false); setSent(null); }}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={send}>
            <h2 id="send-title" className="dialog-title">Send to {shopName}</h2>
            <p className="hint">
              {title} · {quantity}
              {quote && quote.total ? <> · about <strong>{formatMoney(quote.total, quote.currency)}</strong></> : ''} · your file and these settings go to the operator, who checks everything before printing.
            </p>
            <label className="field-label spaced" htmlFor="so-name">Your name</label>
            <input id="so-name" className="num wide-select" autoComplete="name" required minLength={2} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            <label className="field-label spaced" htmlFor="so-phone">Phone number</label>
            <input id="so-phone" className="num wide-select" type="tel" inputMode="tel" autoComplete="tel" required placeholder="0712 345 678" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            <label className="field-label spaced" htmlFor="so-due">When do you need it?</label>
            <input id="so-due" className="num wide-select" type="date" min={dayText(0)} value={form.due} onChange={(e) => set({ due: e.target.value })} />
            <label className="field-label spaced" htmlFor="so-notes">Anything the shop should know? (optional)</label>
            <textarea id="so-notes" className="num wide-select text-area" rows={3} maxLength={2000} placeholder="e.g. collect in town, call before printing" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            {error && <p className="error">{error}</p>}
            <div className="dialog-actions">
              <button type="submit" className="primary" disabled={sending}>{sending ? 'Sending…' : 'Send order'}</button>
              <button type="button" className="ghost-btn wide-btn" onClick={() => setOpen(false)} disabled={sending}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
