import { useEffect, useState } from 'react';
import { api, STATUS_LABELS, ORDER_TOOLS, formatWhen } from '../lib/api.js';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'new', label: 'New' },
  { value: 'needs_customer', label: 'Needs customer' },
  { value: 'approved', label: 'Approved' },
  { value: 'printing', label: 'Printing' },
  { value: 'ready', label: 'Ready' },
  { value: 'all', label: 'All' },
];

// All orders, newest first, with a status filter and a search box.
export default function OrderList({ onOpen }) {
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [data, setData] = useState({ orders: [], counts: {} });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api(`/orders?status=${status}&q=${encodeURIComponent(q)}`, { auth: true })
        .then((r) => alive && (setData(r), setError('')))
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    const t = setTimeout(load, q ? 300 : 0);
    const every = setInterval(load, 30000); // new orders show up by themselves
    return () => {
      alive = false;
      clearTimeout(t);
      clearInterval(every);
    };
  }, [status, q]);

  const openCount = Object.entries(data.counts).filter(([s]) => s !== 'collected' && s !== 'cancelled').reduce((a, [, n]) => a + n, 0);

  return (
    <div className="staff-list">
      <input className="num wide-select" type="search" placeholder="Search code, name, phone or title" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips filter-chips">
        {FILTERS.map((f) => {
          const n = f.value === 'open' ? openCount : f.value === 'all' ? null : data.counts[f.value] || 0;
          return (
            <button key={f.value} type="button" className={`chip ${status === f.value ? 'chip-on' : ''}`} onClick={() => setStatus(f.value)}>
              <span>{f.label}{n ? ` (${n})` : ''}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="error">{error}</p>}
      {!loading && !data.orders.length && <p className="hint empty-list">No orders here.</p>}
      <ul className="order-rows">
        {data.orders.map((o) => (
          <li key={o.id}>
            <button type="button" className="order-row" onClick={() => onOpen(o.id)}>
              <span className="order-row-top">
                <strong>{o.code}</strong>
                <span className={`status-pill small status-${o.status}`}>{STATUS_LABELS[o.status] || o.status}</span>
              </span>
              <span className="order-row-title">{o.title || ORDER_TOOLS[o.tool] || o.tool} · {o.quantity}</span>
              <span className="order-row-sub">
                {o.customerName} · {o.customerPhone} · {formatWhen(o.createdAt)}
                {o.assignedName ? ` · ${o.assignedName}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
