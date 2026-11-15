import { useEffect, useState } from 'react';
import { formatMoney } from '@engine';
import { api, STATUS_LABELS } from '../lib/api.js';
import { waLink, restockMessage } from '../lib/whatsapp.js';
import { agoText } from '../lib/days.js';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'owing', label: 'Owe money' },
  { value: 'quiet', label: 'Time to restock' },
];

const shopUrl = () => `${window.location.origin}${window.location.pathname}`;

// The shop's customers: who buys, who owes, and who has gone quiet. Repeat customers are
// the business, so "Time to restock" lists people with 2 or more orders and nothing for 45 days,
// with a WhatsApp message ready to send.
export function CustomerList({ shop, onOpen }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api(`/customers?filter=${filter}&q=${encodeURIComponent(q)}&limit=300`, { auth: true })
        .then((r) => alive && setList(r.customers))
        .catch((e) => alive && setError(e.message));
    }, q ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filter, q]);

  return (
    <div className="staff-list">
      <input className="num wide-select" type="search" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="group-row">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className={`group ${filter === f.value ? 'group-on' : ''}`} onClick={() => setFilter(f.value)}>{f.label}</button>
        ))}
      </div>
      {filter === 'quiet' && <p className="hint">Bought 2 or more times, nothing in the last 45 days. A short message often brings them back.</p>}
      {error && <p className="error">{error}</p>}
      {list && !list.length && <p className="hint empty-list">Nobody here.</p>}
      <ul className="order-rows">
        {(list || []).map((c) => (
          <li key={c.id} className="card my-order">
            <button type="button" className="job-main" onClick={() => onOpen(c.id)}>
              <span className="order-row-top">
                <strong>{c.name}</strong>
                {c.owes > 0 && <span className="due-late">owes {formatMoney(c.owes)}</span>}
              </span>
              <span className="order-row-sub">{c.phone} · {c.orders} {c.orders === 1 ? 'order' : 'orders'}{c.lastOrderAt ? ` · last ${agoText(c.lastOrderAt)}` : ''} · spent {formatMoney(c.paid)}</span>
            </button>
            {c.quiet && (
              <a className="ghost-btn as-link" href={waLink(c.phone, restockMessage(c.name, null, shopUrl(), shop.shop.name))} target="_blank" rel="noreferrer">WhatsApp: time to restock?</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomerDetail({ id, shop, onBack, onOrder }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/customers/${id}`, { auth: true }).then((r) => setC(r.customer)).catch((e) => setError(e.message));
  }, [id]);

  if (!c) return <div className="staff-detail"><button type="button" className="back-btn" onClick={onBack}>‹ Customers</button>{error ? <p className="error">{error}</p> : <p className="hint">Loading…</p>}</div>;
  const last = c.orders.find((o) => o.status !== 'cancelled');

  return (
    <div className="staff-detail">
      <button type="button" className="back-btn" onClick={onBack}>‹ Customers</button>
      <div className="card">
        <div className="track-title">{c.name}</div>
        <p className="hint">{c.phone} · customer since {new Date(c.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p>
        <div className="money-row">
          <div><span className="hint">Orders</span><strong>{c.orders.length}</strong></div>
          <div><span className="hint">Paid so far</span><strong>{formatMoney(c.paid)}</strong></div>
          <div className={c.owes > 0 ? 'money-owed' : 'money-clear'}><span className="hint">Owes</span><strong>{formatMoney(c.owes)}</strong></div>
        </div>
        <div className="contact-row">
          <a className="ghost-btn" href={`tel:${c.phone}`}>Call</a>
          <a className="ghost-btn" href={waLink(c.phone, `Hello ${c.name.split(' ')[0]}, `)} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="ghost-btn" href={waLink(c.phone, restockMessage(c.name, last, shopUrl(), shop.shop.name))} target="_blank" rel="noreferrer">“Time to restock?”</a>
        </div>
      </div>
      <ul className="order-rows">
        {c.orders.map((o) => (
          <li key={o.id}>
            <button type="button" className="order-row" onClick={() => onOrder(o.id)}>
              <span className="order-row-top">
                <strong>{o.title} · {Number(o.quantity).toLocaleString('en-KE')}</strong>
                <span className={`status-pill small status-${o.status}`}>{STATUS_LABELS[o.status] || o.status}</span>
              </span>
              {o.detail && <span className="order-row-sub">{o.detail}</span>}
              <span className="order-row-sub order-row-money">
                <span>{o.code} · {agoText(o.createdAt)}</span>
                {o.total > 0 && <span className={o.total - o.paid > 0 && o.status !== 'cancelled' ? 'money-owed' : 'money-clear'}>{formatMoney(o.total)}{o.total - o.paid > 0 && o.status !== 'cancelled' ? ` · ${formatMoney(o.total - o.paid)} to pay` : ''}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
