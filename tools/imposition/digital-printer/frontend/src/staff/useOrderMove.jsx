import { useState } from 'react';
import { api } from '../lib/api.js';

// Moving an order to its next step. Two moves need a "yes, on purpose" first, and the
// server is the one that says so (it answers 409 with what it needs):
//   - handing over an order that is not fully paid
//   - printing while a proof is still waiting for the customer
// Returns { move(order, status, body), busyId, error, dialog } - render `dialog` somewhere.
export function useOrderMove(onMoved) {
  const [ask, setAsk] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function move(order, status, body = {}) {
    setBusyId(order.id);
    setError('');
    try {
      const r = await api(`/orders/${order.id}`, { method: 'PATCH', auth: true, json: { status, ...body } });
      setAsk(null);
      onMoved(r.order);
      return true;
    } catch (e) {
      if (e.status === 409 && e.data && e.data.needs) setAsk({ order, status, body, needs: e.data.needs, text: e.message });
      else setError(e.message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const dialog = ask && (
    <div className="dialog-back" role="dialog" aria-modal="true" aria-labelledby="mv-title">
      <div className="dialog">
        <h2 id="mv-title" className="dialog-title">{ask.text}</h2>
        {ask.needs === 'allowOwing' ? (
          <>
            <p className="dialog-text">{ask.order.customerName} has not paid everything for {ask.order.code}. Take the money first, or hand it over and it stays on their account as owing.</p>
            <div className="dialog-actions">
              <a className="primary as-link" href={`#/staff/order/${ask.order.id}`} onClick={() => setAsk(null)}>Record the payment</a>
              <button type="button" className="ghost-btn wide-btn" disabled={!!busyId} onClick={() => move(ask.order, ask.status, { ...ask.body, allowOwing: true })}>Hand over — customer still owes</button>
              <button type="button" className="link-btn" onClick={() => setAsk(null)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="dialog-text">A proof is with {ask.order.customerName} and they have not tapped Approve. Did they approve it another way?</p>
            <div className="dialog-actions">
              <button type="button" className="primary" disabled={!!busyId} onClick={() => move(ask.order, ask.status, { ...ask.body, approvedElsewhere: true })}>Yes — approved by phone or WhatsApp</button>
              <button type="button" className="ghost-btn wide-btn" onClick={() => setAsk(null)}>No, wait for the customer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return { move, busyId, error, dialog };
}
