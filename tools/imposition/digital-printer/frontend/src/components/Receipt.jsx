import { formatMoney } from '@engine';

// A receipt on paper (or "Save as PDF" on a phone). Used by the customer's tracking page
// and by the shop. Money figures come from the server's ledger.
//   order = { code, title, quantity, detail, lines, discount, money, payments, currency, createdAt, customerName? }
export default function Receipt({ order, shop }) {
  const cur = order.currency || 'KES';
  const m = order.money;
  const when = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const method = (x) => (x === 'mpesa' ? 'M-Pesa' : x ? x[0].toUpperCase() + x.slice(1) : '');
  return (
    <section className="paper receipt">
      <div className="paper-head">
        <div>
          <div className="paper-shop">{shop.name}</div>
          {shop.address && <div>{shop.address}</div>}
          {shop.whatsapp && <div>{shop.whatsapp}</div>}
          {shop.pin && <div>PIN {shop.pin}</div>}
        </div>
        <div className="paper-right">
          <div className="paper-kind">{m.balance > 0 ? 'INVOICE' : 'RECEIPT'}</div>
          <strong>{order.code}</strong>
          <div>{when(order.createdAt)}</div>
        </div>
      </div>
      {order.customerName && <p>For: <strong>{order.customerName}</strong>{order.customerPhone ? ` · ${order.customerPhone}` : ''}</p>}
      <table className="paper-table">
        <tbody>
          <tr><th>{order.title} × {Number(order.quantity).toLocaleString('en-KE')}{order.detail ? <small><br />{order.detail}</small> : null}</th><td /></tr>
          {(order.lines || []).map((l, i) => (
            <tr key={i}><td>{l.label}{l.detail ? ` · ${l.detail}` : ''}</td><td className="paper-num">{formatMoney(l.amount, cur)}</td></tr>
          ))}
          {order.discount > 0 && <tr><td>Quantity discount</td><td className="paper-num">−{formatMoney(order.discount, cur)}</td></tr>}
          <tr className="paper-total"><th>Total</th><td className="paper-num">{formatMoney(m.total, cur)}</td></tr>
          {(order.payments || []).map((p, i) => (
            <tr key={`p${i}`}><td>{p.kind === 'refund' ? 'Refund' : 'Paid'} · {method(p.method)} · {when(p.at)}</td><td className="paper-num">{p.kind === 'refund' ? '−' : ''}{formatMoney(p.amount, cur)}</td></tr>
          ))}
          <tr className="paper-total"><th>{m.balance > 0 ? 'Balance to pay' : 'Balance'}</th><td className="paper-num">{formatMoney(Math.max(0, m.balance), cur)}</td></tr>
        </tbody>
      </table>
      <p className="paper-foot">Thank you for printing with {shop.name}. To order again: open {window.location.origin}{window.location.pathname}</p>
    </section>
  );
}
