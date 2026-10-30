import { useEffect, useState } from 'react';
import { api, formatWhen } from '../lib/api.js';
import { store } from '../lib/storage.js';

// Customers check their order with the order code + their phone number (no password).
export default function TrackScreen({ code: startCode = '' }) {
  const [code, setCode] = useState(startCode);
  const [phone, setPhone] = useState(() => store.get('customer', { phone: '' }).phone || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const mine = store.get('myOrders', []);

  async function look(c = code, p = phone) {
    if (!c || !p) return;
    setLoading(true);
    setError('');
    try {
      const r = await api(`/orders/track/${encodeURIComponent(c)}?phone=${encodeURIComponent(p)}`);
      setOrder(r.order);
    } catch (e) {
      setOrder(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Opened from "Track my order": look it up straight away.
  useEffect(() => {
    if (startCode && phone) look(startCode, phone);
  }, [startCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="start track">
      <a className="back-btn as-link" href="#/">‹ Home</a>
      <h1 className="start-title">Track your order</h1>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          look();
        }}
      >
        <label className="field-label" htmlFor="tr-code">Order code</label>
        <input id="tr-code" className="num wide-select" placeholder="PH-7K4QX2" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
        <label className="field-label spaced" htmlFor="tr-phone">Phone number you used</label>
        <input id="tr-phone" className="num wide-select" type="tel" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button type="submit" className="primary spaced-top" disabled={loading || !code || !phone}>{loading ? 'Checking…' : 'Check'}</button>
        {error && <p className="error">{error}</p>}
      </form>

      {order && (
        <div className="card track-result">
          <div className="order-code small">{order.code}</div>
          <div className="track-title">{order.title} · {order.quantity}</div>
          <div className={`status-pill status-${order.status}`}>{order.statusText}</div>
          <ol className="timeline">
            {[...order.events].reverse().map((e, i) => (
              <li key={i} className="timeline-item">
                <span className="timeline-when">{formatWhen(e.at)}</span>
                <span className="timeline-what">{e.statusText || (e.kind === 'message' ? 'Message from the shop' : 'Update')}</span>
                {e.message && <span className="timeline-msg">{e.message}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {mine.length > 0 && (
        <div className="card">
          <div className="field-label">Orders sent from this device</div>
          <div className="my-orders">
            {mine.map((o) => (
              <button
                key={o.code}
                type="button"
                className="chip"
                onClick={() => {
                  setCode(o.code);
                  look(o.code, phone);
                }}
              >
                <span>{o.code}</span>
                <small>{o.title}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
