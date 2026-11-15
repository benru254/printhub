import { formatMoney } from '@engine';
import { ORDER_TOOLS, STATUS_LABELS } from '../lib/api.js';

// The paper that travels with the job through the shop (printed through lib/print.jsx).
export default function JobTicket({ order }) {
  const s = order.summary || {};
  const cur = (order.quote && order.quote.currency) || 'KES';
  const due = order.dueAt ? new Date(order.dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
  const rows = [
    ['Product', order.title || ORDER_TOOLS[order.tool] || order.tool],
    ['Details', s.detail],
    ['Made on', order.quote && order.quote.route === 'offset' ? 'OFFSET PRESS' : order.quote && order.quote.route === 'large' ? 'Large format' : null],
    ['Quantity', order.quantity],
    ['Finished size', s.size],
    ['Paper', s.paper],
    ['Print', s.colour === false ? 'Black & white' : 'Colour'],
    ['Lamination', s.laminate && s.laminate !== 'none' ? s.laminate : 'None'],
    // A product order is PRICED on a standard layout; the operator's real layout may use more sheets.
    [s.product ? 'Priced as' : 'Sheet', s.sheet ? `${s.product && s.sheets ? `${s.sheets} × ` : ''}${s.sheet}${s.perSheet ? ` · ${s.perSheet} per sheet` : ''}` : null],
    ['Sheets to print', s.product ? null : s.sheets],
    ['Pages', s.pages],
    ['Spine', s.spine ? `${s.spine} mm` : null],
    ['Numbers', s.numberFrom !== undefined ? `${s.numberFrom} to ${s.numberTo}` : null],
    ['Area', s.sqm ? `${s.sqm} m²` : null],
    ['Hand over', order.delivery === 'deliver' ? `DELIVER to ${order.address}` : 'Customer collects'],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return (
    <section className="ticket">
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
      {(order.reorderCode || (order.quote && order.quote.speed === 'express') || order.artwork !== 'upload') && (
        <p className="ticket-flags">
          {[order.quote && order.quote.speed === 'express' ? 'EXPRESS' : '', order.artwork === 'design' ? 'SHOP MAKES THE DESIGN' : '', order.artwork === 'later' ? 'WAIT FOR THE CUSTOMER’S DESIGN' : '', order.reorderCode ? `REPEAT OF ${order.reorderCode}` : ''].filter(Boolean).join(' · ')}
        </p>
      )}
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
