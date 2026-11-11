import { formatMoney } from '@engine';
import { ORDER_TOOLS, STATUS_LABELS } from '../lib/api.js';

// The paper that travels with the job through the shop. Only shows when printing
// (the "Print job ticket" button calls window.print()).
export default function JobTicket({ order }) {
  const s = order.summary || {};
  const cur = (order.quote && order.quote.currency) || 'KES';
  const due = order.dueAt ? new Date(order.dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
  const rows = [
    ['Product', order.title || ORDER_TOOLS[order.tool] || order.tool],
    ['Quantity', order.quantity],
    ['Finished size', s.size],
    ['Paper', s.paper],
    ['Print', s.colour === false ? 'Black & white' : 'Colour'],
    ['Lamination', s.laminate && s.laminate !== 'none' ? s.laminate : 'None'],
    ['Sheet', s.sheet ? `${s.sheet}${s.perSheet ? ` · ${s.perSheet} per sheet` : ''}` : null],
    ['Sheets to print', s.sheets],
    ['Pages', s.pages],
    ['Spine', s.spine ? `${s.spine} mm` : null],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return (
    <section className="ticket" aria-hidden>
      <div className="ticket-head">
        <div>
          <div className="ticket-code">{order.code}</div>
          <div>{order.customerName} · {order.customerPhone}</div>
        </div>
        <div className="ticket-due">
          <div>NEEDED BY</div>
          <strong>{due}</strong>
          <div>{STATUS_LABELS[order.status]}</div>
        </div>
      </div>
      <table className="ticket-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th>{k}</th><td>{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
      {order.notes && <p className="ticket-notes"><strong>Customer says:</strong> {order.notes}</p>}
      <p className="ticket-money">
        Price {formatMoney(order.money.total, cur)} · Paid {formatMoney(order.money.paid, cur)} · <strong>Balance {formatMoney(order.money.balance, cur)}</strong>
      </p>
      <div className="ticket-checks">
        {['File checked', 'Printed', 'Laminated', 'Cut', 'Bound', 'Counted', 'Packed'].map((c) => (
          <span key={c}><i /> {c}</span>
        ))}
      </div>
      <p className="ticket-sign">Checked by: ____________________ &nbsp; Collected by: ____________________</p>
    </section>
  );
}
