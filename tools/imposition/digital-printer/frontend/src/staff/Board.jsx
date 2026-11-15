import { useEffect, useState } from 'react';
import { formatMoney } from '@engine';
import { api, ORDER_TOOLS, STATUS_LABELS } from '../lib/api.js';
import { trackUrl } from '../lib/customer.js';
import { waLink, shopMessages } from '../lib/whatsapp.js';
import { dueText } from '../lib/days.js';
import { useOrderMove } from './useOrderMove.jsx';
import { orderBadges } from './orderBadges.js';

const LANES = [
  { id: 'check', label: 'To check', statuses: ['new', 'checking'] },
  { id: 'wait', label: 'With customer', statuses: ['needs_customer', 'proof'] },
  { id: 'print', label: 'To print', statuses: ['approved'] },
  { id: 'printing', label: 'Printing', statuses: ['printing'] },
  { id: 'ready', label: 'Ready', statuses: ['ready'] },
];

// THE PRODUCTION BOARD: every open order in the lane of its next step, soonest-needed
// first, with ONE big button for that step. On a phone one lane shows at a time;
// on a wide screen all five sit side by side (good for a screen on the shop wall).
export default function Board({ me, shop, onOpen }) {
  const [orders, setOrders] = useState([]);
  const [lane, setLane] = useState('check');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [till, setTill] = useState(null);

  const load = () =>
    api('/orders?status=open&limit=300', { auth: true })
      .then((r) => {
        setOrders(r.orders);
        setError('');
        api('/money/summary', { auth: true }).then((m) => setTill(m.summary)).catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // new orders show up by themselves
    return () => clearInterval(t);
  }, []);

  const { move, busyId, error: moveError, dialog } = useOrderMove(() => load());
  const inLane = (l) => orders.filter((o) => l.statuses.includes(o.status));
  const wa = (o, id) => {
    const list = shopMessages({ ...o, money: { balance: o.total - o.paid, depositDue: 0 } }, trackUrl(o.code, o.trackKey), shop.shop.name);
    return waLink(o.customerPhone, (list.find((m) => m.id === id) || list[0]).text);
  };

  function actions(o) {
    const busy = busyId === o.id;
    const go = (status, label, body) => <button type="button" className="primary slim" disabled={busy} onClick={() => move(o, status, body)}>{busy ? '…' : label}</button>;
    if (o.status === 'new') return go('checking', 'Start checking', { assignedStaffId: me.id });
    if (o.status === 'checking') {
      return (
        <>
          <button type="button" className="primary slim" onClick={() => onOpen(o.id)}>Open: fix, send proof</button>
          <button type="button" className="ghost-btn" disabled={busy} onClick={() => move(o, 'approved')}>No proof needed</button>
        </>
      );
    }
    if (o.status === 'proof' || o.status === 'needs_customer') {
      return (
        <>
          <a className="primary slim as-link" href={wa(o, o.status === 'proof' ? 'proof' : o.artwork === 'later' ? 'design' : 'track')} target="_blank" rel="noreferrer">Remind on WhatsApp</a>
          {o.status === 'proof' && <button type="button" className="ghost-btn" disabled={busy} onClick={() => move(o, 'approved')}>They approved</button>}
        </>
      );
    }
    if (o.status === 'approved') return go('printing', 'Start printing');
    if (o.status === 'printing') return go('ready', 'Done — ready');
    return (
      <>
        {go('collected', o.delivery === 'deliver' ? 'Delivered' : 'Collected')}
        <a className="ghost-btn as-link" href={wa(o, 'ready')} target="_blank" rel="noreferrer">Tell them it’s ready</a>
      </>
    );
  }

  return (
    <div className="staff-list">
      {till && (
        <div className="card money-row till">
          <div><span className="hint">Received today</span><strong>{formatMoney(till.net)}</strong></div>
          <div><span className="hint">Open orders</span><strong>{orders.length}</strong></div>
          <div className={till.owedByCustomers > 0 ? 'money-owed' : 'money-clear'}><span className="hint">Customers owe</span><strong>{formatMoney(till.owedByCustomers)}</strong></div>
        </div>
      )}
      <div className="lane-tabs" role="tablist" aria-label="Step">
        {LANES.map((l) => (
          <button key={l.id} type="button" role="tab" aria-selected={lane === l.id} className={`group ${lane === l.id ? 'group-on' : ''}`} onClick={() => setLane(l.id)}>
            {l.label} <span className="lane-count">{inLane(l).length}</span>
          </button>
        ))}
      </div>
      {(error || moveError) && <p className="error">{error || moveError}</p>}
      {loading && <p className="hint">Loading…</p>}

      <div className="board">
        {LANES.map((l) => (
          <section key={l.id} className={`lane ${lane === l.id ? 'lane-on' : ''}`} aria-label={l.label}>
            <h2 className="lane-title">{l.label} <span className="lane-count">{inLane(l).length}</span></h2>
            {!loading && !inLane(l).length && <p className="hint empty-list">Nothing here.</p>}
            {inLane(l).map((o) => {
              const due = dueText(o.dueAt);
              return (
                <article key={o.id} className={`card job ${due && due.late ? 'job-late' : ''}`}>
                  <button type="button" className="job-main" onClick={() => onOpen(o.id)} aria-label={`Open order ${o.code}`}>
                    <span className="order-row-top">
                      <strong>{o.title || ORDER_TOOLS[o.tool] || o.tool} · {Number(o.quantity).toLocaleString('en-KE')}</strong>
                      {due && <span className={due.late || due.days === 0 ? 'due-late' : 'order-row-sub'}>{due.text}</span>}
                    </span>
                    {o.summary && o.summary.detail && <span className="order-row-sub">{o.summary.detail}</span>}
                    <span className="order-row-sub">{o.code} · {o.customerName}{l.statuses.length > 1 ? ` · ${STATUS_LABELS[o.status]}` : ''}{o.assignedName ? ` · ${o.assignedName}` : ''}</span>
                    {orderBadges(o).length > 0 && (
                      <span className="job-badges">
                        {orderBadges(o).map((b) => <span key={b.text} className={`job-badge job-badge-${b.tone}`}>{b.text}</span>)}
                      </span>
                    )}
                  </button>
                  <div className="job-actions">{actions(o)}</div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
      {dialog}
    </div>
  );
}
