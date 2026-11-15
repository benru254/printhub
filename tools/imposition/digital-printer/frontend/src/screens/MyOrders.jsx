import { useState } from 'react';
import { formatMoney } from '@engine';
import { api } from '../lib/api.js';
import { customer, trackHref, rememberKeys } from '../lib/customer.js';
import { store } from '../lib/storage.js';
import { useMyOrders } from '../hooks/useMyOrders.js';
import { agoText } from '../lib/days.js';
import ReorderDialog from '../components/ReorderDialog.jsx';
import { needsYou } from '../lib/orderNeeds.js';

// "My orders": everything this customer ordered, on any phone. No password: this phone
// remembers them after the first order; a new phone asks for the number + one order code.
export default function MyOrders({ shop }) {
  const { data, loading, reload } = useMyOrders();
  const [form, setForm] = useState(() => ({ phone: customer.get().phone || '', code: '' }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(null);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/me/login', { method: 'POST', json: form });
      store.set('customerToken', r.customerToken);
      customer.set({ name: r.customer.name, phone: form.phone });
      rememberKeys(r.orders);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start track">
      <a className="back-btn as-link" href="#/">‹ {shop.shop.name}</a>
      <h1 className="start-title">My orders</h1>

      {loading && <p className="hint">Loading…</p>}

      {!loading && !data && (
        <form className="card" onSubmit={login}>
          <p className="hint">To see your orders on this phone, enter your phone number and the code of any of your orders (it is in the message we sent you).</p>
          <label className="field-label spaced" htmlFor="mo-phone">Phone number</label>
          <input id="mo-phone" className="num wide-select" type="tel" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <label className="field-label spaced" htmlFor="mo-code">An order code</label>
          <input id="mo-code" className="num wide-select" placeholder="PH-7K4QX2" autoCapitalize="characters" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <button type="submit" className="primary spaced-top" disabled={busy || !form.phone || !form.code}>{busy ? 'Checking…' : 'Show my orders'}</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      {data && (
        <>
          <p className="hint">{data.customer.name} · {data.customer.phone}</p>
          {!data.orders.length && <p className="hint empty-list">No orders yet.</p>}
          <ul className="order-rows">
            {data.orders.map((o) => {
              const todo = needsYou(o);
              return (
                <li key={o.code} className="card my-order">
                  <a className="my-order-main" href={trackHref(o.code, o.key)}>
                    <span className="order-row-top">
                      <strong>{o.title} · {Number(o.quantity).toLocaleString('en-KE')}</strong>
                      <span className={`status-pill small status-${o.status}`}>{o.statusText.split(' — ')[0]}</span>
                    </span>
                    {o.detail && <span className="order-row-sub">{o.detail}</span>}
                    <span className="order-row-sub">{o.code} · {agoText(o.createdAt)}{o.total > 0 ? ` · ${formatMoney(o.total)}${o.total - o.paid > 0 && o.status !== 'cancelled' ? ` · ${formatMoney(o.total - o.paid)} to pay` : ' · paid'}` : ''}</span>
                    {todo && <span className="todo-line">{todo} ›</span>}
                  </a>
                  {o.status !== 'cancelled' && <button type="button" className="ghost-btn" onClick={() => setAgain(o)}>Order again</button>}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              customer.forget();
              reload();
            }}
          >
            This is not my phone: forget my orders here
          </button>
        </>
      )}

      {again && <ReorderDialog order={again} access={{ key: again.key }} shop={shop} onClose={() => { setAgain(null); reload(); }} />}
    </main>
  );
}
