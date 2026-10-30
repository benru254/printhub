import { useState } from 'react';
import { api } from '../lib/api.js';
import { store } from '../lib/storage.js';

// "Send to the shop": the customer's file + the settings they chose go to the operator.
// No password: name + phone. The phone (with the order code) is how they track the order.
//   recipe  = the tool settings, so the operator opens the job exactly as the customer set it
//   summary = a few plain facts for the order list (size, sheets, pieces per sheet)
export default function SendOrder({ job, tool, title, quantity, recipe, summary, disabled }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({ ...store.get('customer', { name: '', phone: '' }), notes: '' }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

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
      f.append('file', new Blob([job.bytes], { type: 'application/pdf' }), `${job.name}.pdf`);
      const r = await api('/orders', { method: 'POST', form: f });
      store.set('customer', { name: form.name.trim(), phone: form.phone.trim() });
      const mine = store.get('myOrders', []);
      store.set('myOrders', [{ code: r.code, title, at: new Date().toISOString() }, ...mine].slice(0, 20));
      setSent(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ghost-btn wide-btn" onClick={() => setOpen(true)} disabled={disabled}>
        Send to the shop to print
      </button>
    );
  }

  return (
    <div className="dialog-back" role="dialog" aria-modal="true" aria-labelledby="send-title">
      <div className="dialog">
        {sent ? (
          <>
            <h2 id="send-title" className="dialog-title">Order sent ✓</h2>
            <p className="dialog-text">Your order code is</p>
            <p className="order-code">{sent.code}</p>
            <p className="hint">Keep this code. The shop will check your file and contact you on {form.phone}.</p>
            <div className="dialog-actions">
              <a className="primary as-link" href={`#/track/${sent.code}`}>Track my order</a>
              <button type="button" className="ghost-btn wide-btn" onClick={() => { setOpen(false); setSent(null); }}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={send}>
            <h2 id="send-title" className="dialog-title">Send to the shop</h2>
            <p className="hint">
              {title} · {quantity} · your file and these settings go to the operator, who checks everything before printing.
            </p>
            <label className="field-label spaced" htmlFor="so-name">Your name</label>
            <input id="so-name" className="num wide-select" autoComplete="name" required minLength={2} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            <label className="field-label spaced" htmlFor="so-phone">Phone number</label>
            <input id="so-phone" className="num wide-select" type="tel" inputMode="tel" autoComplete="tel" required placeholder="0712 345 678" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            <label className="field-label spaced" htmlFor="so-notes">Anything the shop should know? (optional)</label>
            <textarea id="so-notes" className="num wide-select text-area" rows={3} maxLength={2000} placeholder="e.g. matt paper, collect on Friday" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
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
